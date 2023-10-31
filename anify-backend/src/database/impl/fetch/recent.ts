import { Prisma } from "@prisma/client";
import { db, dbType, prisma } from "../..";
import { Format, Type } from "../../../types/enums";
import { Anime, Db, Manga } from "../../../types/types";

type ReturnType<T> = T extends "ANIME" ? Anime[] : Manga[];

export const recent = async <T extends "ANIME" | "MANGA">(type: T, formats: Format[], page: number, perPage: number): Promise<ReturnType<T>> => {
    if (dbType === "postgresql") {
        const skip = page > 0 ? perPage * (page - 1) : 0;
        let where;

        if (type === Type.ANIME) {
            where = Prisma.sql`
                ${
                    formats.length > 0
                        ? Prisma.sql`WHERE "anime"."format" IN (${Prisma.join(
                            formats.map((f) => Prisma.raw(`'${f}'`)),
                            ", "
                        )})`
                        : Prisma.empty
                }
            `;
        } else {
            where = Prisma.sql`
                ${
                    formats.length > 0
                        ? Prisma.sql`WHERE "manga"."format" IN (${Prisma.join(
                            formats.map((f) => Prisma.raw(`'${f}'`)),
                            ", "
                        )})`
                        : Prisma.empty
                }
            `;
        }

        let [count, results] = [0, []];
        if (type === Type.ANIME) {
            [count, results] = await prisma.$transaction([
                prisma.$queryRaw`
                        SELECT COUNT(*) FROM "anime"
                        ${where} AND "anime".episodes->'latest'->>'latestEpisode' != '0'
                    `,
                prisma.$queryRaw`
                        SELECT * FROM "anime"
                        ${where} AND "anime".episodes->'latest'->>'latestEpisode' != '0'
                        ORDER BY
                            "anime".episodes->'latest'->>'updatedAt' DESC
                        LIMIT    ${perPage}
                        OFFSET   ${skip}
                    `,
            ]);
        } else {
            [count, results] = await prisma.$transaction([
                prisma.$queryRaw`
                        SELECT COUNT(*) FROM "manga"
                        ${where} AND "manga".chapters->'latest'->>'latestChapter' != '0'
                    `,
                prisma.$queryRaw`
                        SELECT * FROM "manga"
                        ${where} AND "manga".chapters->'latest'->>'latestChapter' != '0'
                        ORDER BY
                            "manga".chapters->'latest'->>'updatedAt' DESC
                        LIMIT    ${perPage}
                        OFFSET   ${skip}
                    `,
            ]);
        }

        const total = Number((count as any)[0].count);
        const lastPage = Math.ceil(Number(total) / perPage);

        const newResults: any[] = [];
        for (const result of results) {
            if (((result as Anime | Manga).type === Type.ANIME ? (result as Anime).episodes.latest.latestEpisode === 0 : (result as Manga).chapters.latest.latestChapter === 0)) continue;

            const updatedAt = ((result as Anime | Manga).type === Type.ANIME ? (result as Anime).episodes : (result as Manga).chapters).latest.updatedAt;

            newResults.push({
                ...(result as Anime | Manga),
                updatedAt: String(updatedAt).length === 0 ? 0 : new Date(Number(updatedAt)).getTime(),
            });
        }

        // Sort by updatedAt
        newResults.sort((a, b) => (b.updatedAt as number) - (a.updatedAt as number));

        // Remove updatedAt
        for (const result of newResults) {
            delete result.updatedAt;
        }

        return newResults;
    }

    const skip = page > 0 ? perPage * (page - 1) : 0;

    const formatParams = formats.map((f) => `'${f}'`).join(", ");
    const newResults: ((Anime | Manga) & { updatedAt?: number })[] = [];

    if (type === Type.ANIME) {
        const sql = `
            SELECT * FROM "anime"
            WHERE "format" IN (${formatParams}) AND episodes->>'latestEpisode' != '0'
            ORDER BY episodes->>'latest'->>'updatedAt' DESC
            LIMIT ${perPage}
            OFFSET ${skip};
        `;

        const countSql = `
            SELECT COUNT(*) FROM "anime"
            WHERE "format" IN (${formatParams}) AND episodes->>'latestEpisode' != '0';
        `;

        const [countResults, results] = await Promise.all([Promise.resolve(db.query(countSql).get()), Promise.resolve(db.query<Db<Anime>, []>(sql).all())]);

        const total = Number(Object.values(countResults ?? {})[0]);
        const lastPage = Math.ceil(Number(total) / perPage);
        const parsedAnime: Anime[] = [];

        for (const anime of results) {
            try {
                parsedAnime.push(
                    Object.assign(anime, {
                        title: JSON.parse(anime.title),
                        season: anime.season.replace(/"/g, ""),
                        mappings: JSON.parse(anime.mappings),
                        synonyms: JSON.parse(anime.synonyms),
                        rating: JSON.parse(anime.rating),
                        popularity: JSON.parse(anime.popularity),
                        relations: JSON.parse(anime.relations),
                        genres: JSON.parse(anime.genres),
                        tags: JSON.parse(anime.tags),
                        episodes: JSON.parse(anime.episodes),
                        artwork: JSON.parse(anime.artwork),
                        characters: JSON.parse(anime.characters),
                    }) as unknown as Anime,
                );
            } catch (e) {
                continue;
            }
        }

        for (const anime of parsedAnime) {
            if (anime.episodes?.latest?.latestEpisode === 0) continue;

            const updatedAt = anime.episodes.latest.updatedAt;

            newResults.push({
                ...anime,
                updatedAt: String(updatedAt).length === 0 ? 0 : new Date(Number(updatedAt)).getTime(),
            });
        }
    } else {
        const sql = `
            SELECT * FROM "manga"
            WHERE "format" IN (${formatParams}) AND chapters->>'latestChapter' != '0'
            ORDER BY chapters->>'latest'->>'updatedAt' DESC
            LIMIT ${perPage}
            OFFSET ${skip};
        `;

        const countSql = `
            SELECT COUNT(*) FROM "manga"
            WHERE "format" IN (${formatParams}) AND chapters->>'latestChapter' != '0';
        `;

        const [countResults, results] = await Promise.all([Promise.resolve(db.query(countSql).get()), Promise.resolve(db.query<Db<Manga>, []>(sql).all())]);

        const total = Number(Object.values(countResults ?? {})[0]);
        const lastPage = Math.ceil(Number(total) / perPage);
        const parsedManga: Manga[] = [];

        for (const manga of results) {
            try {
                parsedManga.push(
                    Object.assign(manga, {
                        title: JSON.parse(manga.title),
                        mappings: JSON.parse(manga.mappings),
                        synonyms: JSON.parse(manga.synonyms),
                        rating: JSON.parse(manga.rating),
                        popularity: JSON.parse(manga.popularity),
                        relations: JSON.parse(manga.relations),
                        genres: JSON.parse(manga.genres),
                        tags: JSON.parse(manga.tags),
                        chapters: JSON.parse(manga.chapters),
                        artwork: JSON.parse(manga.artwork),
                        characters: JSON.parse(manga.characters),
                    }) as unknown as Manga,
                );
            } catch (e) {
                continue;
            }
        }

        for (const manga of parsedManga) {
            if (manga.chapters?.latest?.latestChapter === 0) continue;

            const updatedAt = manga.chapters.latest.updatedAt;

            newResults.push({
                ...manga,
                updatedAt: String(updatedAt).length === 0 ? 0 : new Date(Number(updatedAt)).getTime(),
            });
        }
    }

    newResults.sort((a, b) => b.updatedAt! - a.updatedAt!);

    for (const result of newResults) {
        delete result.updatedAt;
    }

    return newResults as ReturnType<T>;
};

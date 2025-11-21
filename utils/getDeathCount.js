import fetch from "node-fetch";
import * as cheerio from "cheerio";

export async function getDeathCount(username) {
    const url = `https://roatpkz.com/hiscore/user/${encodeURIComponent(username)}/normal/`;

    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    const values = $("td.value");

    if (values.length === 0) {
        return null;
    }
    const deathCount = $(values[3]).text().replace(/,/g, '').trim();

    return deathCount;
}

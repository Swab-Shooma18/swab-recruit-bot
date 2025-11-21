import fetch from "node-fetch";
import * as cheerio from "cheerio";

export async function getJadAndSkotizo(username) {
    const url = `https://roatpkz.com/hiscore/user/${encodeURIComponent(username)}/normal/`;
    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    const values = $("td.value");

    if (values.length < 45) {
        return { jad: 0, skotizo: 0 };
    }

    const jad = $(values[72]).text().replace(/,/g, "").trim();
    const skotizo = $(values[74]).text().replace(/,/g, "").trim();

    return {
        jad: jad || 0,
        skotizo: skotizo || 0
    };
}
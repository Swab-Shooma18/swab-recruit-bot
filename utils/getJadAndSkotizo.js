import fetch from "node-fetch";
import * as cheerio from "cheerio";

export async function getJadAndSkotizo(username) {
    const url = `https://roatpkz.com/hiscore/user/${encodeURIComponent(username)}/normal/`;
    const res = await fetch(url);
    const html = await res.text();

    const jadRegex = /TzTok-Jad Kills[\s\S]*?<td class="value">\s*([\d,]+)\s*<\/td>/i;
    const skotizoRegex = /Skotizo Kills[\s\S]*?<td class="value">\s*([\d,]+)\s*<\/td>/i;

    const jadMatch = html.match(jadRegex);
    const skotizoMatch = html.match(skotizoRegex);

    return {
        jad: jadMatch ? jadMatch[1].replace(/,/g, "") : 0,
        skotizo: skotizoMatch ? skotizoMatch[1].replace(/,/g, "") : 0
    };
}
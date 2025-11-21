import fetch from "node-fetch";
import * as cheerio from "cheerio";

export async function getJadAndSkotizo(username) {
    const url = `https://roatpkz.com/hiscore/user/${encodeURIComponent(username)}/normal/`;
    const res = await fetch(url);
    const html = await res.text();

    // Regex voor Jad kills
    const jadMatch = html.match(/TzTok-Jad Kills<\/td>\s*<td class="value">([\d,]+)<\/td>/i);
    const jadKills = jadMatch ? jadMatch[1].replace(/,/g, "") : 0;

    // Regex voor Skotizo kills
    const skotizoMatch = html.match(/Skotizo Kills<\/td>\s*<td class="value">([\d,]+)<\/td>/i);
    const skotizoKills = skotizoMatch ? skotizoMatch[1].replace(/,/g, "") : 0;

    return { jadKills, skotizoKills };
}
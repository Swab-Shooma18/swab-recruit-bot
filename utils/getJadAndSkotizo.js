import fetch from "node-fetch";
import * as cheerio from "cheerio";

export async function getJadAndSkotizo(username) {
    const url = `https://roatpkz.com/hiscore/user/${encodeURIComponent(username)}/normal/`;
    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    function getValue(label) {
        const row = $("td.label").filter(function () {
            return $(this).text().trim() === label;
        }).first();

        if (!row.length) return null;

        return row.next("td.value").text().trim().replace(/,/g, "");
    }

    return {
        jad: getValue("TzTok-Jad Kills"),
        skotizo: getValue("Skotizo Kills")
    };
}
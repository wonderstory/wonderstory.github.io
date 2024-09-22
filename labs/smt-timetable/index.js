"use strict";

// 重複する要素を省く
const uniq = (array) => [...new Set(array)];

// マルチバイトの数字を11バイトの数字に変換
const toAsciiDigitLetters = (text) =>
    text.replace(/[０-９]/g, (m) => "０１２３４５６７８９".indexOf(m));

// 数字のみを残す
const toOnlyDigitLetters = (text) => text.replace(/[^0-9]/g, "");

// SHA-256によるハッシュ値を得る
const toSha256 = async (text) => {
    const uint8 = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", uint8);
    return Array.from(new Uint8Array(digest))
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
};

// HTML読み込み後のイベント
document.addEventListener("DOMContentLoaded", completed, false);
window.addEventListener("load", completed, false);

function completed() {
    document.removeEventListener("DOMContentLoaded", completed, false);
    window.removeEventListener("load", completed, false);
    ready();
}

// 準備完了：解析実行
function ready() {
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        console.log("submit");

        let content = form.content.value;

        // if (form.content.value === "") {
        //     content = await (await fetch("./schedule.txt")).text();
        // }

        parsePage(content);
    });
}
async function parsePage(content) {
    // スタイルを作成
    const tableStyle = document.createElement("style");
    document.head.appendChild(tableStyle);

    // timetable格納
    const timetable = new Timetable();
    // Dateオブジェクトの基準日
    const baseDay = new Date().toISOString().split("T")[0];
    // 描画範囲の時間帯
    let rangeFrom = new Date(baseDay).setHours(12);
    let rangeTo = new Date(baseDay).setHours(12);

    // 解析対象
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");

    // 見出し
    const heading = doc.querySelector("h1");
    if (heading) {
        document.querySelector("h1").innerText = heading.innerText;
    }

    // シアター番号リスト
    const theaters = uniq(
        [...doc.querySelectorAll(".time-cell:first-child")].map((s, i) =>
            s.innerText.trim()
        )
    );
    // 数値（シアター「1」など）をもとに並び替え
    const getOrderIndexAsNumber = (target) =>
        Number(toOnlyDigitLetters(toAsciiDigitLetters(target)));
    theaters.sort(
        (a, b) => getOrderIndexAsNumber(a) - getOrderIndexAsNumber(b)
    );
    timetable.addLocations(theaters);

    if (theaters.length === 0) {
        alert("解析失敗しました。");
        return;
    }

    // 各行を処理
    const rows = [...doc.querySelectorAll(".timeTable tr")];
    let titleId = 0;
    let title = "";
    let theater = "";
    for (const row of rows) {
        // 映画のタイトル
        const titleElement = row.querySelector(".movie-title");
        if (titleElement) {
            // 子要素を削除（直下のテキストだけを残す）
            for (const child of titleElement.children) {
                child.remove();
            }
            title = titleElement.innerText.trim();
            title = title.split("（本編：")[0];
            titleId++;
            console.log(title);

            // タイトルに対応する色・スタイル
            const colorHex = await toSha256(title).then((text) =>
                text.substring(0, 6)
            );
            const rule = `.timetable .time-entry[data-id='${titleId}'] { background: #${colorHex}; border-color: #${colorHex}}`;
            console.log(rule);
            tableStyle.sheet.insertRule(rule);
            continue;
        }

        // シアター番号
        const theaterElement = row.querySelector(".time-cell:first-child");
        if (!theaterElement) {
            continue;
        }
        theater = theaterElement.innerText.trim();
        console.log(theater);

        // 時間の表記
        const timeTexts = [...row.querySelectorAll(".time-cell .time")].map(
            (s, i) => s.innerText.trim()
        );
        // 時刻を分解してタイムテーブルに反映していく
        for (const text of timeTexts) {
            console.log(text);

            // 開始・終了を分離
            const segments = text.split("~");

            if (segments.length !== 2) {
                continue;
            }

            // 各時分を分離
            const starts = segments[0].split(":");
            const stops = segments[1].split(":");

            if (starts.length !== 2 || stops.length !== 2) {
                continue;
            }

            // 開始・終了時刻を組み立て
            const createDate = (hm) => {
                const d = new Date(baseDay);
                d.setHours(hm[0].trim());
                d.setMinutes(hm[1].trim());
                d.setSeconds(0);
                d.setMilliseconds(0);
                return d;
            };
            const start = createDate(starts);
            const stop = createDate(stops);

            // 終了時刻が開始時刻より早い表記のとき（24時以降の深夜帯）は終了時刻を翌日扱い
            if (stop < start) {
                stop.setDate(stop.getDate() + 1);
            }

            // 各映画の識別子
            const options = {
                data: {
                    id: titleId,
                },
            };
            // タイムテーブルに反映
            timetable.addEvent(title, theater, start, stop, options);

            // 描画範囲（全体の開始・終了時間）を更新
            if (start < rangeFrom) {
                rangeFrom = start;
            }
            if (rangeTo < stop) {
                rangeTo = stop;
            }
        }
    }

    // 描画範囲の時間帯
    console.log("from " + rangeFrom);
    console.log("to " + rangeTo);

    // 時刻を0〜23に収める処理
    const fixRange = (hour) => {
        let value = hour;
        while (value < 0) {
            value += 24;
        }
        while (23 < value) {
            value -= 24;
        }
        return value;
    };

    timetable.setScope(
        fixRange(rangeFrom.getHours()),
        fixRange(rangeTo.getHours() + 1)
    );

    // timetable描画
    const renderer = new Timetable.Renderer(timetable);
    renderer.draw(".timetable");
}

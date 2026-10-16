import { createCanvas } from "@napi-rs/canvas";

console.log("before");

const canvas = createCanvas(100, 100);

console.log("after canvas");

const ctx = canvas.getContext("2d");

console.log("after context");

ctx.fillStyle = "red";
ctx.fillRect(0, 0, 100, 100);

console.log("before buffer");

const buf = canvas.toBuffer("image/png");

console.log("after buffer", buf.length);

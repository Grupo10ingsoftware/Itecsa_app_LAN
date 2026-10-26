import { config } from "dotenv";

config(process.env.DOTENV_PATH
    ? { path: process.env.DOTENV_PATH, override: true }
    : undefined);

if (!process.env.NODE_ENV?.trim()) {
    process.env.NODE_ENV = process.env.APP_ENV?.trim() || "development";
}

if (!process.env.APP_ENV?.trim()) process.env.APP_ENV = process.env.NODE_ENV;

await import("./app.js");

import dotenv from "dotenv";

dotenv.config();

const {
  DISCORD_TOKEN,
  GITHUB_USERNAME,
  GITHUB_REPOSITORY,
  GITHUB_INSTALLATION_ID,
  GITHUB_APP_ID,
  DISCORD_CHANNEL_ID
} = process.env;

if (
  !DISCORD_TOKEN ||
  !GITHUB_USERNAME ||
  !GITHUB_REPOSITORY ||
  !DISCORD_CHANNEL_ID || 
  !GITHUB_INSTALLATION_ID ||
  !GITHUB_APP_ID
) {
  throw new Error("Missing environment variables");
}

export const config = {
  DISCORD_TOKEN,
  GITHUB_USERNAME,
  GITHUB_REPOSITORY,
  GITHUB_INSTALLATION_ID,
  GITHUB_APP_ID,
  DISCORD_CHANNEL_ID
};

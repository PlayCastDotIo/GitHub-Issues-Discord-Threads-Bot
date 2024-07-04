import express from "express";
import { GithubHandlerFunction } from "../interfaces";
import path from "path";
import { readFileSync } from "fs";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { config } from "../config";
import {
  handleClosed,
  handleCreated,
  handleDeleted,
  handleLocked,
  handleOpened,
  handleReopened,
  handleUnlocked,
} from "./githubHandlers";

const app = express();
app.use(express.json());

async function generateGitToken(): Promise<string> {
  console.log("generating new token, old token: ", gitToken);
  // Read the private key from file
  const keyfilePath = path.join(__dirname, "../../key.pem");
  const privateKey = readFileSync(keyfilePath, "utf8");

  // Create authentication object
  const auth = createAppAuth({
    appId: String(config.GITHUB_APP_ID),
    privateKey: String(privateKey),
    installationId: String(config.GITHUB_INSTALLATION_ID)
  });

  // Authenticate and get installation access token
  try {
    const { token } = await auth({ type: "installation" });
    return token;
  } catch (error) {
    console.error("Error generating token: ", error);
    return "";
  }
}

// intial value 
let gitToken: string;

async function isTokenValid(token: string): Promise<boolean> {
  // Check if the token is valid
  const octokit = new Octokit({ auth: token });
  try {
    await octokit.rest.apps.getAuthenticated();
  } catch (error) {
    console.error("Error validating token: ", error);
    console.log("Invalid Token: ", token);
    return false;
  }
  return true;
}

// TODO: need to call this on error of git actions
export async function getGitToken(): Promise<string> {
  if (!gitToken || !(await isTokenValid(gitToken))) {
    gitToken = await generateGitToken();
  }
  // this will only return a valid token
  return gitToken;
}

export function initGithub() {
  app.get("", (_, res) => {
    res.json({ msg: "github webhooks work" });
  });

  const githubActions: {
    [key: string]: GithubHandlerFunction;
  } = {
    opened: (req) => handleOpened(req),
    created: (req) => handleCreated(req),
    closed: (req) => handleClosed(req),
    reopened: (req) => handleReopened(req),
    locked: (req) => handleLocked(req),
    unlocked: (req) => handleUnlocked(req),
    deleted: (req) => handleDeleted(req),
  };

  app.post("/", async (req, res) => {
    const githubAction = githubActions[req.body.action];
    githubAction && githubAction(req);
    res.json({ msg: "ok" });
  });

  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;

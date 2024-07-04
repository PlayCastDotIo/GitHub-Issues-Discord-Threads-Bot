import { graphql } from "@octokit/graphql";
import { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";
import { Attachment, Collection, Message } from "discord.js";
import { config } from "../config";
import { getGitToken } from "./github";
import { GitIssue, Thread } from "../interfaces";
import {
  ActionValue,
  Actions,
  Triggerer,
  getGithubUrl,
  logger,
} from "../logger";
import { store } from "../store";
// import { get } from "http";

let gitToken: string;
let octokit: Octokit; // Declare `octokit` without initializing.
let graphqlWithAuth: typeof graphql;


// Function to refresh the token
// will init both octokit and graphql instances with a fresh token since they both use the same one
async function refreshToken() {
  const token = await getGitToken().catch((err) => {
    console.error("failed to get token: ", err);
    throw err;
  });
  gitToken = token;

  // Create octokit instance
  octokit = new Octokit({
    auth: gitToken,
    baseUrl: "https://api.github.com",
  });

  // Create graphql instance
  graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `token ${token}`,
    },
  });
}

// init the octokit and graphql instances with a fresh token on boot
refreshToken().then(() => {
  console.log("refreshed token");
}).catch((err) => {
  console.error("failed to refresh token: ", err);
});


const repoCredentials = {
  owner: config.GITHUB_USERNAME || "",
  repo: config.GITHUB_REPOSITORY || "",
};

export { octokit, repoCredentials };

// logging functions
const info = (action: ActionValue, thread: Thread) =>
  logger.info(`${Triggerer.Discord} | ${action} | ${getGithubUrl(thread)}`);

const error = (action: ActionValue | string, thread?: Thread) =>
  logger.error(
    `${Triggerer.Discord} | ${action} ` +
      (thread ? `| ${getGithubUrl(thread)}` : ""),
  );

function attachmentsToMarkdown(attachments: Collection<string, Attachment>) {
  let md = "";
  attachments.forEach(({ url, name, contentType }) => {
    switch (contentType) {
      case "image/png":
      case "image/jpeg":
        md += `![${name}](${url} "${name}")`;
        break;
    }
  });
  return md;
}

function getIssueBody(params: Message) {
  const { guildId, channelId, id, content, author, attachments } = params;
  const { globalName, avatar } = author;

  return (
    `<kbd>[![${globalName}](https://cdn.discordapp.com/avatars/${author.id}/${avatar}.webp?size=40)](https://discord.com/channels/${guildId}/${channelId}/${id})</kbd> [${globalName}](https://discord.com/channels/${guildId}/${channelId}/${id})  \`BOT\`\n\n` +
    `${content}\n` +
    `${attachmentsToMarkdown(attachments)}\n`
  );
}

const regexForDiscordCredentials =
  /https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)(?=\))/;
export function getDiscordInfoFromGithubBody(body: string) {
  const match = body.match(regexForDiscordCredentials);
  if (!match || match.length !== 4)
    return { channelId: undefined, id: undefined };
  const [, , channelId, id] = match;
  return { channelId, id };
}

function formatIssuesToThreads(issues: GitIssue[]): Thread[] {
  const res: Thread[] = [];
  issues.forEach(({ title, body, number, node_id, locked, state }) => {
    const { id } = getDiscordInfoFromGithubBody(body);
    if (!id) return;
    res.push({
      id,
      title,
      number,
      body,
      node_id,
      locked,
      comments: [],
      appliedTags: [],
      archived: state === "closed",
    });
  });
  return res;
}

async function update(issue_number: number, state: "open" | "closed") {
  const sendUpdate = async () => {
    await octokit.rest.issues.update({
      ...repoCredentials,
      issue_number,
      state,
    });
    return true;
  };

  try {
    sendUpdate();
  } catch (err) {
    if (err instanceof RequestError) {
      if (err.status === 401 || err.message.includes("Bad credentials")) {
        try {
          await refreshToken();
          console.log("Refreshed octokit in update");
          await sendUpdate();
        } catch (refreshErr) {
          console.error("Failed to initialize octokit in update: ", refreshErr);
          return refreshErr;
        }
      }
    } else {
      return err;
    }
  }
}

export async function closeIssue(thread: Thread) {
  const { number: issue_number } = thread;

  if (!issue_number) {
    error("Thread does not have an issue number", thread);
    return;
  }

  const response = await update(issue_number, "closed");

  if (response === true) {
    info(Actions.Closed, thread);
  } else if (response instanceof Error) {
    error(`Failed to close issue: ${response.message}`, thread);
  } else {
    error("Failed to close issue due to an unknown error", thread);
  } 
}

export async function openIssue(thread: Thread) {
  const { number: issue_number } = thread;

  if (!issue_number) {
    error("Thread does not have an issue number", thread);
    return;
  }

  const response = await update(issue_number, "open");
  if (response === true) {
    info(Actions.Reopened, thread);
  } else if (response instanceof Error) {
    error(`Failed to open issue: ${response.message}`, thread);
  } else {
    error("Failed to open issue due to an unknown error", thread);
  }
}

export async function lockIssue(thread: Thread) {
  const { number: issue_number } = thread;
  if (!issue_number) {
    error("Thread does not have an issue number", thread);
    return;
  }

  try {
    await octokit.rest.issues.lock({
      ...repoCredentials,
      issue_number,
    });

    info(Actions.Locked, thread);
  } catch (err) {
    if (err instanceof RequestError) {
      if (err.status === 401 || err.message.includes("Bad credentials")) {
        // refresh the token
        refreshToken().then(() => {
          console.log("refreshed octokit in lock");
        }).catch((err) => {
          console.error("failed to initialize octokit in lock: ", err);
          return err;
        });

        // try again
        octokit.rest.issues.lock({
          ...repoCredentials,
          issue_number,
        }).then(() => {
          info(Actions.Locked, thread);
        }).catch((err) => {
          if (err instanceof Error) {
            error(`Failed to lock issue: ${err.message}`, thread);
          } else {
            error("Failed to lock issue due to an unknown error", thread);
          }
        });
      }
    } else if (err instanceof Error) {
      error(`Failed to lock issue: ${err.message}`, thread);
    } else {
      error("Failed to lock issue due to an unknown error", thread);
    }
  }
}

export async function unlockIssue(thread: Thread) {
  const { number: issue_number } = thread;
  if (!issue_number) {
    error("Thread does not have an issue number", thread);
    return;
  }

  try {
    await octokit.rest.issues.unlock({
      ...repoCredentials,
      issue_number,
    });

    info(Actions.Unlocked, thread);
  } catch (err) {
    if (err instanceof RequestError) {
      if (err.status === 401 || err.message.includes("Bad credentials")) {
        // refresh the token
        refreshToken().then(() => {
          console.log("refreshed octokit in unlock");
        }).catch((err) => {
          console.error("failed to initialize octokit in unlock: ", err);
          return err;
        });

        // try again
        octokit.rest.issues.unlock({
          ...repoCredentials,
          issue_number,
        }).then(() => {
          info(Actions.Unlocked, thread);
        }).catch((err) => {
          if (err instanceof Error) {
            error(`Failed to unlock issue: ${err.message}`, thread);
          } else {
            error("Failed to unlock issue due to an unknown error", thread);
          }
        });
      }
    } else if (err instanceof Error) {
      error(`Failed to unlock issue: ${err.message}`, thread);
    } else {
      error("Failed to unlock issue due to an unknown error", thread);
    }
  }
}

export async function createIssue(thread: Thread, params: Message) {
  const { title, appliedTags, number } = thread;

  if (number) {
    error("Thread already has an issue number", thread);
    return;
  }

  const sendCretaeIssue = async () => {
    const labels = appliedTags?.map(
      (id) => store.availableTags.find((item) => item.id === id)?.name || "",
    );

    labels?.push("triage", "discord");
    const body = getIssueBody(params);
    const response = await octokit.rest.issues.create({
      ...repoCredentials,
      labels,
      title,
      body,
    });

    if (response && response.data) {
      thread.node_id = response.data.node_id;
      thread.body = response.data.body!;
      thread.number = response.data.number;
      info(Actions.Created, thread);
    } else {
      error("Failed to create issue - No response data", thread);
    }
  };

  try {
    await sendCretaeIssue();
  } catch (err) {
    if (err instanceof RequestError) {
      if (err.status === 401 || err.message.includes("Bad credentials")) {
        try {
          await refreshToken();
          await sendCretaeIssue();
        } catch (refreshErr) {
          console.error("Failed to initialize octokit in create issue: ", refreshErr);
        }
      }
    } else {
      error("Failed to create issue due to an unknown error", thread);
    }
  }
}

export async function createIssueComment(thread: Thread, params: Message) {
  const body = getIssueBody(params);
  const { number: issue_number } = thread;

  if (!issue_number) {
    error("Thread does not have an issue number", thread);
    return;
  }

  const createComment = async () => {
    const response = await octokit.rest.issues.createComment({
      ...repoCredentials,
      issue_number,
      body,
    });
    if (response && response.data) {
      const git_id = response.data.id;
      const id = params.id;
      thread.comments.push({ id, git_id });
      info(Actions.Commented, thread);
    } else {
      error("Failed to create comment - No response data", thread);
    }
  };

  try {
    await createComment();
  } catch (err) {
    if (err instanceof RequestError) {
      if (err.status === 401 || err.message.includes("Bad credentials")) {
        try {
          await refreshToken();
          await createComment();
        } catch (refreshErr) {
          console.error("Failed to initialize octokit in create comment: ", refreshErr);
        }
      }
    }
  }
}

export async function deleteIssue(thread: Thread) {
  const { node_id } = thread;
  if (!node_id) {
    error("Thread does not have a node ID", thread);
    return;
  }

  const query = `mutation {deleteIssue(input: {issueId: "${node_id}"}) {clientMutationId}}`;

  const performDelete = async () => {
    await graphqlWithAuth(query);
    info(Actions.Deleted, thread);
  };

  try {
    await performDelete();
  } catch (err) {
    if (err instanceof RequestError) {
      if (err.status === 401 || err.message.includes("Bad credentials")) {
        try {
          await refreshToken();
          console.log("Refreshed octokit in delete issue");
          await performDelete();
        } catch (refreshErr) {
          console.error("Failed to initialize octokit in delete issue: ", refreshErr);
        }
      }
    } else if (err instanceof Error) {
      error(`Error deleting issue: ${err.message}`, thread);
    } else {
      error("Error deleting issue due to an unknown error", thread);
    }
  }
}

export async function deleteComment(thread: Thread, comment_id: number) {
  const performDelete = async () => {
    await octokit.rest.issues.deleteComment({
      ...repoCredentials,
      comment_id,
    });
    info(Actions.DeletedComment, thread);
  };

  try {
    await performDelete();
  } catch (err) {
    if (err instanceof RequestError && (err.status === 401 || err.message.includes("Bad credentials"))) {
      try {
        await refreshToken();
        console.log("Refreshed octokit in delete comment");
        await performDelete();
      } catch (refreshErr) {
        console.error("Failed to initialize octokit in delete comment: ", refreshErr);
      }
    } else if (err instanceof Error) {
      error(`Failed to delete comment: ${err.message}`, thread);
    } else {
      error("Failed to delete comment due to an unknown error", thread);
    }
  }
}

export async function getIssues() {
  const fetchIssues = async () => {
    const response = await octokit.rest.issues.listForRepo({
      owner: repoCredentials.owner!,
      repo: repoCredentials.repo!,
      state: "all",
    });

    if (!response || !response.data) {
      error("Failed to get issues - No response data");
      return [];
    }

    await fillCommentsData();
    return formatIssuesToThreads(response.data as GitIssue[]);
  };

  try {
    return await fetchIssues();
  } catch (err) {
    if (err instanceof RequestError && (err.status === 401 || err.message.includes("Bad credentials"))) {
      try {
        await refreshToken();
        console.log("Refreshed octokit in get issues");
        return await fetchIssues();
      } catch (refreshErr) {
        console.error("Failed to initialize octokit in get issues: ", refreshErr);
        return [];
      }
    } else {
      error("Failed to get issues due to an unknown error");
      return [];
    }
  }
}

async function fillCommentsData() {
  const listComments = async () => {
    const response = await octokit.rest.issues.listCommentsForRepo({
      ...repoCredentials,
    });

    if (response && response.data) {
      response.data.forEach((comment) => {
        const { channelId, id } = getDiscordInfoFromGithubBody(comment.body!);
        if (!channelId || !id) return;

        const thread = store.threads.find((i) => i.id === channelId);
        thread?.comments.push({ id, git_id: comment.id });
      });
    } else {
      error("Failed to load comments - No response data");
    }
  };

  try {
    await listComments();
  } catch (err) {
    if (err instanceof RequestError && (err.status === 401 || err.message.includes("Bad credentials"))) {
      try {
        await refreshToken();
        console.log("Refreshed octokit in fill comments");
        await listComments();
      } catch (refreshErr) {
        console.error("Failed to initialize octokit in fill comments: ", refreshErr);
      }
    } else {
      error("Failed to load comments due to an unknown error");
    }
  }
}

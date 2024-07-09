import { Request } from 'express';
import {
  archiveThread,
  createComment,
  createThread,
  deleteThread,
  lockThread,
  unarchiveThread,
  unlockThread,
} from '../discord/discordActions';
import { GitHubLabel } from '../interfaces';
import { store } from '../store';
import { getDiscordInfoFromGithubBody } from './githubActions';

async function getIssueNodeId(req: Request): Promise<string | undefined> {
  const node_id  = req.body.issue.node_id;
  if (!node_id) {
    return;
  }
  return node_id;
}

export async function handleOpened(req: Request) {
  console.log('gitHdl - opened');
  if (!req.body.issue) return;
  const { node_id, number, title, user, body, labels } = req.body.issue;
  if (store.threads.some((thread) => thread.node_id === node_id)) return;

  const { login } = user;
  const appliedTags = (<GitHubLabel[]>labels)
    .map(
      (label) =>
        store.availableTags.find((tag) => tag.name === label.name)?.id || '',
    )
    .filter((i) => i);

  createThread({ login, appliedTags, number, title, body, node_id });
}

export async function handleCreated(req: Request) {
  console.log('gitHdl - created');
  const comment = req.body.comment;
  if (!comment) {
    console.error('Comment is undefined in the request body.');
    return;
  }

  const { user, id, body } = comment;
  if (!user || !id || !body) {
    console.error('Missing user, id, or body in the comment object.');
    return;
  }

  const { login, avatar_url } = user;
  const { node_id } = req.body.issue;

  // Check if the comment already contains Discord info
  if (getDiscordInfoFromGithubBody(body).channelId) {
    // If it does, stop processing (assuming created with a bot)
    return;
  }

  createComment({
    git_id: id,
    body,
    login,
    avatar_url,
    node_id,
  });
}

export async function handleClosed(req: Request) {
  console.log('gitHdl - closed');
  const node_id = await getIssueNodeId(req);
  if (node_id !== undefined) {
    archiveThread(node_id);
  } else {
    console.error('Failed to get node_id for closed issue');
  }
}

export async function handleReopened(req: Request) {
  console.log('gitHdl - reopened');
  const node_id = await getIssueNodeId(req);
  if (node_id !== undefined) {
    unarchiveThread(node_id);
  } else {
    console.error('Failed to get node_id for reopened issue');
  }
}

export async function handleLocked(req: Request) {
  console.log('gitHdl - locked');
  const node_id = await getIssueNodeId(req);
  if (node_id !== undefined) {
    lockThread(node_id);
  } else {
    console.error('Failed to get node_id for locked issue');
  }
}

export async function handleUnlocked(req: Request) {
  console.log('gitHdl - unlocked');
  const node_id = await getIssueNodeId(req);
  if (node_id !== undefined) {
    unlockThread(node_id);
  } else {
    console.error('Failed to get node_id for closed issue');
  }
}

export async function handleDeleted(req: Request) {
  console.log('git Hdl - deleted');
  const node_id = await getIssueNodeId(req);
  if (node_id !== undefined) {
    deleteThread(node_id);
  } else {
    console.error('Fialed to get node_id for deleted issue');
  }
}

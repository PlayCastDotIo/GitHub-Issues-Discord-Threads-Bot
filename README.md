## Managing GitHub Issues via Discord Threads

This Discord bot serves as a seamless bridge between Discord thread channel and GitHub repository issues, enabling efficient issue management and synchronization between the two platforms. This integration allows for efficient project management, ensuring that actions performed on either Discord or GitHub are reflected in both platforms, facilitating smoother collaboration and issue tracking across teams.

### Functionality Overview

#### Issues

- \[x] Discord Post Creation -> Automatically generates a corresponding GitHub issue.
- \[ ] GitHub Issue Creation -> Pending feature: Creation of Discord posts from GitHub issues.

#### Comments

- \[x] Discord Post Comments -> Mirrored as comments on associated GitHub issues.
- \[ ] GitHub Issue Comments -> Pending feature: Synchronization with Discord post comments.

#### Tags & Labels

- \[x] Discord Post Tags -> Translated into GitHub issue labels for better categorization.
- \[ ] Discord Post Tag Changes -> Future implementation: Update GitHub issue labels from Discord.
- \[ ] GitHub Issue Label Changes -> Future implementation: Reflect changes in Discord post tags from GitHub.

#### Locking & Unlocking

- \[x] Discord Post Lock/Unlock -> Corresponding action on GitHub issues for security or access control.
- \[x] GitHub Issue Lock/Unlock -> Syncing locking status with Discord posts.

#### Open/Close Management

- \[x] Discord Post Open/Close -> Triggers opening or closing of related GitHub issues.
- \[x] GitHub Issue Open/Close -> Update Discord post status based on GitHub issue status.

#### Deletion Actions

- \[x] Discord Post Deletion -> Initiates the removal of the associated GitHub issue.
- \[x] GitHub Issue Deletion -> Sync deletion actions from GitHub to Discord posts.

#### Attachment Support

- \[x] Supported File Types: png, jpeg
- \[ ] Planned Support: gif, text, video

## Installation Steps

### Discord Bot

Create a discord bot <https://discord.com/developers/applications?new_application=true>

Once created go to `Bot > Privileged Gateway Intents` and enable the following:

- \[x] PRESENCE INTENT
- \[x] MESSAGE CONTENT INTENT

Use `OAuth > OAuth2 URL Generator` to generate an integration URL for your server. For `Scopes` only enable `Bot`. This will prompt you to set the `Bot Permissions`. Enable the following for each category:

General Permissions:

- Read Messages / View Channels

Text Permissions

- Send Messages
- Create Public Threads
- Create Private Threads
- Send Messages in Threads
- Manage Messages
- Manage Threads
- Embed Links
- Attach FIles
- Read Message History
- Mention Everyone
- Use External Emojis
- Use External Stickers
- Add Reactions

These permissions result in the permissions integer of: `464393636928` which is used in the invite URL.

Finally set the Integration Type to "Guild Install". Your invite url should look similar to:

```bash
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=532576463936&integration_type=0&scope=bot
```

Use the generated URL and discord will prompt you with where to install the created bot. From there you will need to integrate the bot with the desired thread(s) to listen to.

### Github

Create a github app and add it to the repo that you want issues to be added to.
Refer to: <https://docs.github.com/en/apps/creating-github-apps>

### .env file requirements

- DISCORD_TOKEN - Discord developer bot page "Settings > bot > reset token" [LINK](https://discord.com/developers/applications/APPLICATION_ID/bot)
- DISCORD_CHANNEL_ID - In the Discord server, create a forum channel and right-click (RMB) to copy the channel ID (developer settings must be turned on for this). Alternatively, you can copy the ID from the link. Example:
<https://discord.com/channels/><GUILD_ID>/<DISCORD_CHANNEL_ID>
- GITHUB_USERNAME - example: <https://github.com/><GITHUB_USERNAME>/<GITHUB_REPOSITORY>
- GITHUB_REPOSITORY
- GITHUB_APP_ID
- GITHUB_INSTALLATION_ID
- GITHUB_ACCESS_TOKEN *(OLD - we do not reuqire anymore)*
    1. [New Fine-grained Personal Access Token](https://github.com/settings/personal-access-tokens/new) or follow these steps: Settings -> Developer settings -> Personal access tokens -> Fine-grained tokens -> Generate new token.
    2. In the "Repository access" section, select "Only select repositories" and choose the specific repositories you need access to.
    3. In the "Permissions" section, click on "Repository permissions" and set "Issues" to "Read & Write".
    4. Generate and copy the personal access token.

> **NOTE:** For detailed information about personal access tokens, visit the [Managing your personal access tokens - GitHub Docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

### Development

```bash
npm i
npm run dev
```

### Build / Deploy

**NOTE** bot is currently running on a lightsail instance: `bitnami@54.79.126.219`. For access talk to George or Leon.

```bash
$ npm run build 
$ pm2 start dist/index.js --name discord-bot

# check on the instance with 
$ pm2 status 

# copy over updates
$ rsync -avz --exclude 'node_modules/' ./ bitnami@54.79.126.219:~/discord_bot/
```

### Github => Discord Traffic

Configure the Github App you created to have the following webhook:

- Webhook URL: `http://discordwebhook.playcast.io`
- Set webhook content type to `application/json`

We have our bot running on a lightsail instance with the domain discordwebhook.playcast.io assigned to it. The App listens to port `5000` for incoming traffic so we use nginx to reroute traffic from port `80` to `5000`. Refer to the nginx config file `discordwebhook.playcast.io`.

Use the following to configure:

```bash
# put the file from the repo into the required location
$ sudo mv discordwebhook.playcast.io /etc/nginx/sites-available/
$ sudo ln -s /etc/nginx/sites-available/discordwebhook.playcast.io /etc/nginx/sites-enabled/
$ sudo nginx -t
$ sudo systemctl reload nginx


# alternativley you can run (not really tested so just use nginx unless you're feeling high levels of angst)
$ npm run forward 
```

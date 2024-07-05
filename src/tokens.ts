import { readFileSync } from 'fs';
import path from 'path';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { RequestError } from '@octokit/request-error';
import { graphql } from '@octokit/graphql';
import { config } from './config'; // Adjust the path to your config file

// responsible for managing the github token that needs to be generated at runtime 
// has functionality to check the current token and refresh it if required
class TokenManager {
  gitToken: string;
  octokit: Octokit; 
  graphqlWithAuth: typeof graphql;
  tokenExpiry: Date;

  // on boot will init all vairiables
  // then get a proper token and set them up accordingly
  constructor() {
    this.gitToken = '';
    this.octokit = new Octokit();
    this.graphqlWithAuth = graphql;
    this.tokenExpiry = new Date();
    this.init();
  }

  async init() {
    if (!this.gitToken || this.isTokenExpired()) {
      await this.refresh();
    }
  }

  async generateGitToken() {
    // Read the private key from file
    const keyfilePath = path.join(__dirname, '../key.pem');
    const privateKey = readFileSync(keyfilePath, 'utf8');

    // Create authentication object
    const auth = createAppAuth({
      appId: String(config.GITHUB_APP_ID),
      privateKey: String(privateKey),
      installationId: String(config.GITHUB_INSTALLATION_ID)
    });

    // Authenticate and get installation access token
    try {
      const { token, expiresAt } = await auth({ type: 'installation' });
      this.tokenExpiry = new Date(expiresAt);
      return token;
    } catch (error) {
      console.error('Error generating token: ', error);
      return '';
    }
  }

  async isAuthValid() {
    try {
      const octokit = await this.getOctokit();
      await octokit.rest.users.getAuthenticated();
      return true;
    } catch (err) {
      if (err instanceof RequestError && (err.status === 401 
          || err.message.includes('Bad credentials'))) {
        return false;
      } else {
        throw err;
      }
    }
  }

  // fucntion to check if token is expired 
  isTokenExpired() {
    return !this.tokenExpiry || new Date() > this.tokenExpiry;
  }

  async refresh() {
    try {
      const token = await this.generateGitToken();
      this.gitToken = token;

      this.octokit = new Octokit({
        auth: this.gitToken,
        baseUrl: 'https://api.github.com',
      });

      this.graphqlWithAuth = graphql.defaults({
        headers: {
          authorization: `token ${token}`,
        },
      });
    } catch (err) {
      console.error('Failed to refresh token: ', err);
      throw err;
    }
  }

  async getOctokit() {
    await this.init();
    return this.octokit;
  }

  async getGraphqlWithAuth() {
    await this.init();
    return this.graphqlWithAuth;
  }
}

const tokenManager = new TokenManager();
export default tokenManager;
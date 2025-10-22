import simpleGit, { SimpleGit } from "simple-git";
import { mkdir, access } from "node:fs/promises";
import path from "node:path";
import { T_GitHubRepoConfig } from "../types/index.js";

const REPOS_CACHE_DIR = path.join(process.cwd(), ".repos");

/**
 * Clone or update a GitHub repository locally
 */
export async function cloneOrUpdateRepo(
  config: T_GitHubRepoConfig
): Promise<string> {
  const localPath =
    config.localPath ||
    path.join(REPOS_CACHE_DIR, config.owner, config.repo);

  // Ensure cache directory exists
  await mkdir(path.dirname(localPath), { recursive: true });

  const git: SimpleGit = simpleGit();

  try {
    // Check if repo already exists
    await access(path.join(localPath, ".git"));

    // Repo exists, update it
    const repoGit = simpleGit(localPath);
    await repoGit.fetch();
    await repoGit.checkout(config.branch);
    await repoGit.pull("origin", config.branch);

    console.log(`Updated ${config.owner}/${config.repo} at ${localPath}`);
  } catch {
    // Repo doesn't exist, clone it
    const repoUrl = `https://github.com/${config.owner}/${config.repo}.git`;
    await git.clone(repoUrl, localPath, ["--branch", config.branch]);

    console.log(`Cloned ${config.owner}/${config.repo} to ${localPath}`);
  }

  return localPath;
}

/**
 * Get the current commit hash of a repository
 */
export async function getCurrentCommit(repoPath: string): Promise<string> {
  const git = simpleGit(repoPath);
  const log = await git.log({ maxCount: 1 });
  return log.latest?.hash || "unknown";
}

/**
 * List all files in a repository matching patterns
 */
export async function listRepoFiles(
  repoPath: string,
  patterns: string[] = ["**/*"]
): Promise<string[]> {
  const fg = (await import("fast-glob")).default;
  return fg(patterns, {
    cwd: repoPath,
    dot: false,
    onlyFiles: true,
    ignore: ["node_modules/**", ".git/**", "dist/**", "build/**", ".next/**"],
  });
}

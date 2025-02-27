const axios = require("axios");
const { exec } = require("child_process");
// const schedule = require("node-schedule"); // For scheduling the script

// GitHub Configuration
const MAIN_BRANCH = "main"; // Replace with 'master', 'develop', or your main branch name

// Axios configuration for GitHub API
const githubApi = axios.create({
    baseURL: BASE_API_URL,
    headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
    },
});

// Helper function to fetch all branches
async function fetchBranches() {
    try {
        const response = await githubApi.get("/branches");
        return response.data;
    } catch (error) {
        console.error("Error fetching branches:", error.message);
    }
}

// Helper function to check if a branch has been merged
async function isMerged(branchName) {
    try {
        const response = await githubApi.get(`/pulls`, {
            params: {
                state: "closed", // Closed PRs
                base: MAIN_BRANCH,
                head: `${REPO_OWNER}:${branchName}`,
            },
        });

        // If there's a merged PR with this branch as the head, it's considered merged
        return response.data.some((pr) => pr.merged_at !== null);
    } catch (error) {
        console.error(`Error checking if branch '${branchName}' is merged:`, error.message);
        return false;
    }
}

// Helper function to delete a branch from the remote repository
async function deleteBranch(branchName) {
    try {
        await githubApi.delete(`/git/refs/heads/${branchName}`);
        console.log(`✅ Deleted remote branch: ${branchName}`);
    } catch (error) {
        console.error(`Error deleting branch '${branchName}':`, error.message);
    }
}

// Helper function to delete a local branch
function deleteLocalBranch(branchName) {
    return new Promise((resolve, reject) => {
        exec(`git branch -D ${branchName}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error deleting local branch '${branchName}':`, stderr);
                reject(error);
            } else {
                console.log(`✅ Deleted local branch: ${branchName}`);
                resolve(stdout);
            }
        });
    });
}

// Function to clean up both remote and local branches
async function cleanUpBranches() {
    console.log("🚀 Starting cleanup job...");

    const branches = await fetchBranches();

    for (const branch of branches) {
        const branchName = branch.name;

        // Skip the main branch or protected branches
        if (branchName === MAIN_BRANCH || branch.protected) {
            console.log(`⚠️ Skipping protected branch: ${branchName}`);
            continue;
        }

        // Check if the branch is merged
        const merged = await isMerged(branchName);

        if (merged) {
            console.log(`🗑️ Branch '${branchName}' is merged. Deleting remote and local copies...`);

            // Delete the remote branch
            await deleteBranch(branchName);

            // Delete the local branch
            try {
                await deleteLocalBranch(branchName);
            } catch (error) {
                console.warn(`⚠️ Unable to delete local branch '${branchName}' - It might not exist locally.`);
            }
        } else {
            console.log(`💡 Branch '${branchName}' is not merged. Skipping...`);
        }
    }

    console.log("🎉 Cleanup job finished!");
}

// Bringing in local branches and syncing with remote
function updateLocalBranches() {
    return new Promise((resolve, reject) => {
        console.log("🔄 Updating local branch list to sync with remote...");
        exec(`git fetch --prune`, (error, stdout, stderr) => {
            if (error) {
                console.error("Error fetching updates from remote:", stderr);
                reject(error);
            } else {
                console.log("✅ Local branch list updated!");
                resolve(stdout);
            }
        });
    });
}

// Main function to update local branches and clean up
async function runCleanup() {
    try {
        await updateLocalBranches();
        await cleanUpBranches();
    } catch (error) {
        console.error("❌ Cleanup job failed:", error.message);
    }
}

// Run immediately when called
runCleanup();
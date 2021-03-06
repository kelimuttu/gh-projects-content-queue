/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
"use strict";

const Issue = require("./issue");
const DataStoreHolder = require("./data-store-holder");

//TODO use webhooks instead of polling for updates.

/**
 * Loads all closed issues.
 *
 * @this Issues
 * @async
 * @param {Map} [oldIssues=new Map()] - Previous issues.
 * @returns {Map} New issues map.
 * @fires Issues#closed
 */
function fetchClosedIssues(oldIssues = new Map()) {
    return this.fetchIssues(oldIssues, "closed").then((issues) => {
        for(const issue of issues.values()) {
            if(!oldIssues.has(issue.number)) {
                this.emit("closed", issue);
            }
            else if(issue.justUpdated) {
                delete issue.justUpdated;
            }
        }

        return issues;
    });
}


/**
 * Loads all open issues into the issues map, updates changed issues and
 * removes issues that were closed.
 *
 * @this Issues
 * @async
 * @param {Map} [oldIssues=new Map()] - Previous issues.
 * @returns {Map} New Issues map.
 * @fires Issues#opened
 * @fires Issues#updated
 * @todo avoid discarding Issue instances by moving them between closed & open issues? How does this interact with concurrent updates?
 */
function fetchOpenIssues(oldIssues = new Map()) {
    return this.fetchIssues(oldIssues, "open").then((issues) => {
        for(const issue of issues.values()) {
            if(!oldIssues.has(issue.number)) {
                this.emit("opened", issue);
            }
            else if(issue.justUpdated) {
                this.emit("updated", issue);
                delete issue.justUpdated;
            }
        }

        return issues;
    });
}

/**
 * An issue was opened.
 *
 * @event Issues#opened
 * @type {Issue}
 */

/**
 * An issue was changed remotely.
 *
 * @event Issues#updated
 * @type {Issue}
 */

/**
 * An issue was closed.
 *
 * @event Issues#closed
 * @type {Issue}
 */

/**
 * Holds a list of all GitHub issues for a repo and emits events when issues are
 * added, closed or edited.
 */
class Issues extends DataStoreHolder {
    /**
     * @param {PromisifiedGitHub} githubClient - GitHub client to use.
     * @param {Object} config - Repository infromation.
     */
    constructor(githubClient, config) {
        super({
            issues: fetchOpenIssues,
            closedIssues: fetchClosedIssues
        });
        this.config = config;
        this.githubClient = githubClient;

        this.firstRun = true;
        this.ready = this.issues.then(() => {
            this.firstRun = false;
        }).catch((e) => {
            console.error("Issues ready", e);
            throw e;
        });
    }

    /**
     * Creates the issue info object for the Issue class.
     *
     * @param {Object} apiData - The issue info the API returns.
     * @returns {Object} Object for the Issue class.
     */
    getIssueInfo(apiData) {
        return {
            id: apiData.id,
            number: apiData.number,
            repo: this.config.repo,
            owner: this.config.owner,
            updated_at: apiData.updated_at,
            asignee: apiData.assignee ? apiData.assignee.login : undefined,
            labels: apiData.labels ? apiData.labels.map((l) => l.name): [],
            content: apiData.body,
            title: apiData.title,
            state: apiData.state == "open"
        };
    }

    /**
     * Creates an issue in the repository.
     *
     * @param {string} title - Title for the issue.
     * @param {string} text - Body for the issue to add.
     * @returns {Issue} Created issue.
     */
    async createIssue(title, text) {
        const { data: res } = await this.githubClient.issues.create({
            repo: this.config.repo,
            owner: this.config.owner,
            title,
            body: text
        });
        const issue = new Issue(this.githubClient, this.getIssueInfo(res));
        const issues = await this.issues;
        issues.set(issue.number, issue);
        return issue;
    }

    /**
     * Loads issues into a map, updates and removes issues.
     *
     * @todo pagination
     * @this Issues
     * @param {Map} [oldIssues=new Map())] - Previous issues.
     * @param {string} [state="open"] - State of the issues to fetch.
     * @returns {Map} Updated map.
     */
    async fetchIssues(oldIssues = new Map(), state = "open") {
        const { data: issues } = await this.githubClient.issues.getForRepo({
            owner: this.config.owner,
            repo: this.config.repo,
            state,
            per_page: 100
        });
        const newIssues = new Map();
        for(const i in issues) {
            // Skips the request meta info
            if(i == "meta") {
                continue;
            }
            const issue = issues[i];
            if(!oldIssues.has(issue.number)) {
                newIssues.set(issue.number, new Issue(this.githubClient, this.getIssueInfo(issue)));
            }
            else {
                const issueModel = oldIssues.get(issue.number);
                newIssues.set(issue.number, issueModel);
                if(Date.parse(issue.updated_at) > issueModel.lastUpdate) {
                    issueModel.update(this.getIssueInfo(issue));
                    issueModel.justUpdated = true;
                }
            }
        }
        return newIssues;
    }
}

module.exports = Issues;

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
"use strict";

//TODO ensure repo exists.

const Repository = require("./repo");
const TwitterAccount = require("./twitter-account");

const DEFAULT_LABELS = {
    retweet: "Retweet",
    ready: "ready",
    invalid: "invalid"
};

/**
 * Basic class that manages the events for a single repo.
 */
class ContentQueue {
    /**
     * @param {external:GitHub} githubClient - GitHub client from GitHub
     *                                           authenticated for a user.
     * @param {external:Twitter} twitterClient - Authenticated for a user.
     * @param {Object} config - Config for this project.
     * @constructs
     */
    constructor(githubClient, twitterClient, config) {
        const [ owner, repo ] = config.repo.split("/");
        config.owner = owner;
        config.repo = repo;

        config.labels = Object.assign(Object.assign({}, DEFAULT_LABELS), config.labels);

        this.config = config;
        this.githubClient = githubClient;
        this.twitterClient = twitterClient;
        this.twitterAccount = new TwitterAccount(twitterClient);
        this.sources = [];

        this.repo = new Repository(githubClient, this.twitterAccount, config);

        Promise.all([
            this.repo.ready,
            this.twitterAccount.ready
        ]).then(() => {
            if(typeof config.sources == "object" && config.sources != null) {
                for(const s in config.sources) {
                    const Source = require(`./sources/${s}`);
                    this.sources.push(new Source(this.repo, this.twitterAccount));
                }
            }
        }).catch((e) => console.error("ContentQueue setup", e));
    }
}

module.exports = ContentQueue;

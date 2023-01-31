var NodeHelper = require("node_helper");
const {google} = require('googleapis');
const fs = require('fs');

module.exports = NodeHelper.create({

    start: function() {
        
        console.log("Starting node helper for: " + this.name);

        this.oAuth2Client;
        this.service;
    },

    socketNotificationReceived: function(notification, payload) {

        if (notification === "MODULE_READY") {
            if(!this.service) {
                this.authenticate();
            } else {
                // Check if tasks service is already running, avoids running authentication twice
                console.log("TASKS SERVICE ALREADY RUNNING, DONT NEED TO AUTHENTICATE AGAIN")
                this.sendSocketNotification("SERVICE_READY", {});
            }
        } else if (notification === "REQUEST_UPDATE") {
            this.getList(payload);
	}
    },

    authenticate: function() {
        var self = this;

        fs.readFile(self.path + '/credentials.json', (err, content) => {
            if (err) {
		var payload = {code: err.code, message: err.message, details: err.details};

		self.sendSocketNotification("TASKS_API_ERROR", payload);
		return console.log('Error loading client secret file:', err);
	    }
            // Authorize a client with credentials, then call the Google Tasks API.
            authorize(JSON.parse(content), self.startTasksService);
          });

        function authorize(credentials, callback) {
            const {client_secret, client_id, redirect_uris} = credentials.installed;
            self.oAuth2Client = new google.auth.OAuth2(
                client_id, client_secret, redirect_uris[0]);
          
            // Check if we have previously stored a token.
            fs.readFile(self.path + '/token.json', (err, token) => {
              if (err) return console.log('Error loading token');
              self.oAuth2Client.setCredentials(JSON.parse(token));
              callback(self.oAuth2Client, self);
            });
        }
    },

    startTasksService: function(auth, self) {
        self.service = google.tasks({version: 'v1', auth});
        self.sendSocketNotification("SERVICE_READY", {});
    },

    buildList: function(config, listItems, pageToken){
	let self = this;

        if(!self.service) {
            console.log("Refresh required"); 
            return;
        }

	self.service.tasks.list({
	    tasklist: config.listID,
	    maxResults: 100, // number of maxResults per page on API results - going max here
	    showCompleted: false, // Google API default is true
	    showHidden: false, // Google API default is true
	    pageToken: pageToken,
	}).then(res => {
	    let nextPageToken = res.data.nextPageToken;
	    listItems = listItems.concat(res.data.items);
	    if (nextPageToken){
		// Continue to fetch the next page as long as the Google API says there is one
		self.buildList(config, listItems, nextPageToken);
	    } else {
		let payload = {id: config.listID, items: listItems};
		self.sendSocketNotification("UPDATE_DATA", payload);
	    }
	}).catch(err => {
		let payload = {code: err.code, message: err.message, details: err.details};
		self.sendSocketNotification("TASKS_API_ERROR", payload);
		return console.error('The API returned an error: ' + err);
	});
    },

    getList: function(config) {
        let self = this;
	let pageToken;
	let listItems = [];
	// Going to recursively build the listItems
	self.buildList(config, listItems, pageToken);
    },
});

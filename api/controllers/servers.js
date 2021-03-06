var servers = require('express').Router();
var server = require('../models/server.js');
var db = require('../common/db.js');
var device = require('../models/device.js');
var schedule = require('node-schedule');
var exec = require('child_process').exec;
var cron = require('../common/cron-handler.js');

/**
 * This endpoint adds a new server
 * @route POST /servers/add
 * @group Servers - Operations about Jamf Pro Servers
 * @param {string} url.body.required - The URL of the Jamf Pro Server
 * @param {string} username.body.required - Admin username of user in the Jamf Pro Server
 * @param {string} password.body.required - Admin password of user in the Jamf Pro Server
 * @param {string} cronLimited.body.required - A cron string that specifys how often to grab limited inventory
 * @param {string} cronExpanded.body.required - A cron string that specifys how often to grab expanded inventory
 * @returns {object} 201 - The server was added to the database successfully, return a status message
 * @returns {object} 206 - The server was added to the database successfully, but the cron jobs on the system could not be verified.
 * @returns {Error}  401 - Unable to contact the JPS server
 * @returns {Error}  500 - Unable to insert server to the database
 * @returns {Error}  206 - Unable to setup scout admin user
 */
servers.post('/add', function(req,res) {
  if (req.body.url == null || req.body.username == null || req.body.password == null || req.body.cronLimited == null || req.body.cronExpanded == null){
    return res.status(400).send({
      error : "Missing Required Fields"
    });
  }
  server.addNewServer(req.body.url, req.body.username, req.body.password, req.body.cronLimited, req.body.cronExpanded)
  .then(function(result) {
    //Need to now resetup the cron jobs
    server.getAllServers()
    .then(function(serverList){
      //Take the server list and pass it to the handler
      cron.handleServerRecords(serverList)
      .then(function(cronResult){
        res.status(201).send({ status : "success" });
      })
      .catch(function(error){
        res.status(206).send({ error : "Unable to verify cron jobs, please restart your server to fix this." });
        console.log(error);
      });
    })
    .catch(function(error){
      res.status(206).send({ error : "Unable to verify cron jobs, please restart your server to fix this." });
      console.log(error);
    });
  })
  .catch(error => {
    console.log(error);
    if (error.error == "Unable to contact server"){
      return res.status(401).send({ error: "Unable to contact JPS Server - check creds and try again"});
    } else if (error.error == "Unable to insert server to the database"){
      return res.status(500).send({ error: "Unable to insert server to the database. Check the scout logs."});
    } else if (error.error == "Unable to setup scout admin user"){
      return res.status(206).send({ error: "Unable to setup the scout admin user, emergency access will not function."});
    }
    res.status(500).send({ error: "Unkown error has occured"});
  });
});

/**
 * This endpoint grants emergency access to the server
 * @route POST /servers/access
 * @group Servers - Operations about Jamf Pro Servers
 * @param {string} url.body.required - The URL of the Jamf Pro Server
 * @returns {object} 200 - An object containing the ScoutAdmin user password
 * @returns {Error}  500 - Unable to remove the password from the database after getting it for the user, will not return password
 * @returns {Error}  400 - Unable to find server for given url or the server does not have an emergency admin setup
 */
servers.post('/access/', function(req,res){
  //Make sure this user has access to view passwords
  //First make sure there is a password that hasn't been destroyed
  server.getServerFromURL(req.body.url)
  .then(function(serverDetails){
    var encryptedPassword = serverDetails[0].scout_admin_password;
    if (encryptedPassword != '' && encryptedPassword != null){
      var resObj = { password : db.decryptString(encryptedPassword) };
      //destroy the password from the database
      server.setScoutAdminPassword(req.body.url, null)
      .then(function(result){
        res.status(200).send(resObj);
      })
      .catch(error => {
        console.log(error);
        res.status(500).send({
          error: "Unable to destory password, refusing to return password"
        });
      });
    } else {
      return res.status(400).send({
        error: "No emergency admin password has been setup for this server"
      });
    }
  })
  .catch(error => {
    console.log(error);
    res.status(400).send({
      error: "Unable to find server"
    });
  });
});

/**
 * This endpoint adds a new server
 * @route PUT /servers/update/{serverId}
 * @group Servers - Operations about Jamf Pro Servers
 * @param {string} id.query.required - The Id of the Jamf Pro Server to update
 * @param {string} username.body.optional - Admin username of user in the Jamf Pro Server
 * @param {string} password.body.optional - Admin password of user in the Jamf Pro Server
 * @param {string} cronLimited.body.optional - A cron string that specifys how often to grab limited inventory
 * @param {string} cronExpanded.body.optional - A cron string that specifys how often to grab expanded inventory
 * @returns {object} 200 - The server was updated successfully
 * @returns {Error}  500 - Unable to update the JPS server
 * @returns {Error}  403 - Unable to update a specific field
 */
servers.put('/update/:id', function(req,res){
  if (req.params.id == null){
    return res.status(400).send({
      error : "Missing Required Fields"
    });
  }
  //Only allow update of certain fields
  if ("url" in req.body || "scout_admin_id" in req.body || "scout_admin_password" in req.body){
    return res.status(403).send({
      error : "Unable to update specified field"
    });
  }
  //if they are updating the password, encrypt it
  if ("password" in req.body){
    req.body.password = db.encryptString(req.body.password);
  }
  server.updateServer(req.params.id, req.body)
  .then(function(result){
    res.status(200).send({success : true});
  })
  .catch(error => {
    console.log(error);
    return res.status(500).send({
      error: "Unable to update JPS server"
    });
  });
});

/**
 * This gets all of the servers in Scout
 * @route DELETE /servers/delete/{serverId}
 * @group Servers - Operations about Jamf Pro Servers
 * @param {string} id.query.required - The Id of the Jamf Pro Server to delete
 * @returns {object} 200 - A success object if the server was deleted
 * @returns {Error}  500 - Unable to query the database, delete all of the server's devices, or delete the server itself
 */
servers.delete('/delete/:id', function(req,res) {
  if (req.params.id == null){
    return res.status(400).send({
      error : "Missing Required Fields"
    });
  }
  var serverId = req.params.id;
  //Delete the server from the database
  server.deleteServer(serverId)
  .then(function(result) {
    //If success, then delete the devices for that jps
    device.deleteDevicesByJPSId(serverId)
    .then(function(result) {
      res.status(200).send({ status : "success" });
    })
    .catch(error => {
      console.log(error);
      res.status(500).send({
        error: "Unable to delete devices"
      });
    });
  })
  .catch(error => {
    console.log(error);
    res.status(500).send({
      error: "Unable to delete JPS server"
    });
  });
});

/**
 * This gets all of the servers in Scout
 * @route GET /servers/
 * @group Servers - Operations about Jamf Pro Servers
 * @returns {object} 200 - An array of server objects
 * @returns {Error}  500 - Unable to query the database
 */
servers.get('/', function(req,res) {
  //Get all of the servers in the database
  server.getAllServers()
  .then(function(serverList){
    var servers = [];
    for (i = 0; i < serverList.length; i++){
      var s = { "id" : serverList[i].id, "url" : serverList[i].url, "username" : serverList[i].username, "org_name" : serverList[i].org_name, "ac" : serverList[i].activation_code, "cronLimited" : serverList[i].cron_update, "cronExpanded" : serverList[i].cron_update_expanded};
      servers.push(s);
    }
    res.status(200).send({
      servers : servers
    });
  })
  .catch(error => {
    console.log(error);
    res.status(500).send({
      error: "Unable to get servers"
    });
  });
});

module.exports = servers;

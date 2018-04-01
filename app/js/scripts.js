function addServerToDatabase(url,username,password,cron){
  var serverObject = { "url" : url, "username" : username, "password" : password, "cron" : cron};
  //send it to the server
  var post = getRequestObject('/servers/add', serverObject, 'POST');
  post.done(function(res){
    $('#add-server-modal').modal('hide');
    swal('Server Added', 'The server has been addded to the database successfully.', 'success');
    loadServerTable();
  })
  .fail(function(xhr){
    swal('Server Upload Failed', 'The server has not been added to the database, please check the console for more details.', 'error');
    console.log(xhr);
  })
}

function updateComputers(){
  var computerTable = $("#computers-table").DataTable(getDataTablesRequest('computer'));
  var computers = getRequestObject('/devices/count/computer', null, 'GET');
  //Get a count of the total devices seperate since data tables can't handle success functions
  computers.done(function(computers){
    $("#macos-device-count").html(computers.size);
  })
  .fail(function(xhr){
    console.log(xhr);
  });
}

function updateMobileDevices(){
  var mobileTable = $("#mobiledevices-table").DataTable(getDataTablesRequest('mobile'));
  var mobile = getRequestObject('/devices/count/mobile', null, 'GET');
  //Get a count of the total devices seperate since data tables can't handle success functions
  mobile.done(function(mobiledevices){
    $("#ios-device-count").html(mobiledevices.size);
  })
  .fail(function(xhr){
    console.log(xhr);
  });
}

function deleteServer(id){
  var serverDelete = getRequestObject('/servers/delete/' + id.toString(), null, 'DELETE');
  serverDelete.done(function(res){
    console.log(res);
    swal('Server Deleted', 'The server and all of it\'s devices have been removed.', 'success');
    loadServerTable();
  })
  .fail(function(xhr){
    console.log(xhr);
  });
}

function getServerButtons(id){
  return '<button type="button" id="edit_'+id+'" class="edit_server btn btn-info btn-circle"><i class="fa fa-pencil"></i></button>&nbsp;&nbsp;<button type="button" id="delete_'+id+'" onclick="deleteServer(\''+id+'\')" class="btn btn-danger delete_server btn-circle"><i class="fa fa-times"></i></button>';
}

function loadServerTable(){
  var serverTable = $("#server-table").DataTable();
  serverTable.clear();
  var servers = getRequestObject('/servers', null, 'GET');
  //render the table after the servers are loaded from the DB
  servers.done(function(servers){
    $("#server-count").html(servers.servers.length);
    //Add to the server table
    for (i = 0; i < servers.servers.length; i++){
      var s = servers.servers[i];
      console.log(s);
      serverTable.row.add( [s.url, s.username, s.org_name, s.ac, s.cron,getServerButtons(s.id) ] );
    }
    serverTable.draw();
  })
  .fail(function(xhr) {
    console.log(xhr);
  })
  $("#tvos-device-count").html(0);
}

function doLoginLDAP(){
  var loginObj = {"username" : $("#login-username").val(), "password" : $("#login-password").val()};
  var req = getRequestObject('/users/login/ldap', loginObj, 'POST');
  req.done(function(data){
    sessionStorage.setItem("auth_token", data.token);
    $('#login-modal').modal('hide');
    renderPage();
  })
  .fail(function(xhr){
    $(".login-group").addClass("has-error");
  })
}

function doLoginUserPass(){
  var loginObj = {"email" : $("#login-user-username").val(), "password" : $("#login-user-password").val()};
  var req = getRequestObject('/users/login/basic', loginObj, 'POST');
  req.done(function(data){
    sessionStorage.setItem("auth_token", data.token);
    $('#login-user-modal').modal('hide');
    renderPage();
  })
  .fail(function(xhr){
    $(".login-group").addClass("has-error");
  })
}

function registerUser(){
  var loginObj = {"email" : $("#register-email").val(), "password" : $("#register-password").val(), "register_pin" : $("#register-pin").val()};
  var req = getRequestObject('/users/create', loginObj, 'POST');
  req.done(function(data){
    sessionStorage.setItem("auth_token", data.token);
    $('#login-user-modal').modal('hide');
    $('#register-modal').modal('hide');
    renderPage();
  })
  .fail(function(xhr){
    $(".login-group").addClass("has-error");
  })
}

function doLogOut(){
  sessionStorage.removeItem("auth_token");
  location.reload();
}

function renderPage(){
  //Get all of the Jamf Pro Servers
  loadServerTable();
  updateComputers();
  updateMobileDevices();
  //Setup button listeners
  $("#add-server-button").click(function(){
    addServerToDatabase($("#add-server-url").val(), $("#add-server-username").val(), $("#add-server-password").val(), $("#add-server-cron").val());
  });
  $("#servers-table-div").show();
  $('#cron-selector').cron({
    onChange: function() {
        $('#add-server-cron').val($(this).cron("value"));
    }
  }); // apply cron with default options
}

//Wait for the page to render
$(document).ready(function(){
  if (!("auth_token" in sessionStorage)){
    $("#login-button").click(function(){
      doLoginLDAP();
    });
    $("#login-user-button").click(function(){
      doLoginUserPass();
    });
    $("#register-button").click(function(){
      registerUser();
    });
    $('#login-user-modal').modal('show');
  } else {
    renderPage();
  }
});
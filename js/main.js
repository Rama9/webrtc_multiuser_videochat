'use strict';

var isChannelReady;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;
var clientID;
var remoteClientID;
 
var isBroadCaster = false;
var isStreamer= false;

var pc_config = {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]};

var pc_constraints = {'optional': [{'DtlsSrtpKeyAgreement': true}]};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {'mandatory': {
  'OfferToReceiveAudio':true,
  'OfferToReceiveVideo':true }};

/////////////////////////////////////////////

var room = location.pathname.substring(1);
if (room === '') {
//  room = prompt('Enter room name:');
  room = 'foo';
} else {
  //
}

var socket = io.connect();

if (room !== '') {
  console.log('Create or join room', room);
  socket.emit('create or join', room);
}

socket.on('ID', function (id){
  console.log('client ID is: ' + id);
  clientID = id;
});

socket.on('created', function (room){
  console.log('Created room ' + room);
  isBroadCaster = true;
});

socket.on('full', function (room){
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (room, rid){
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the broadcaster of room ' + room + '!');
  isChannelReady = true;
  remoteClientID = rid;
});

socket.on('joined', function (room){
  console.log('This peer has joined room ' + room);
  isChannelReady = true;
  remoteClientID = clientID;
});

socket.on('log', function (array){
  console.log.apply(console, array);
});

////////////////////////////////////////////////

function sendMessage(message, locClientID, remClientID){
	console.log('Client sending message: ', message, locClientID, remClientID);
  socket.emit('message', message, locClientID, remClientID);
}

socket.on('message', function (message, fromClientID, toClientID){
  console.log('Client received message:', message, fromClientID);
  if (message === 'got user media' && clientID == 0) {
	console.log('May be start at: ', message);
  	maybeStart();
  } else if (message.type === 'offer' && toClientID === clientID) {
      console.log('May be start at: ', message.type);
      remoteClientID = clientID;
      maybeStart();
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer' && clientID == 0) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' ) {
    if ( clientID == 0 || clientID == remoteClientID ) {
        var candidate = new RTCIceCandidate({
        sdpMLineIndex: message.label,
        candidate: message.candidate
        });
        pc.addIceCandidate(candidate);
    }
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});

////////////////////////////////////////////////////

var localVideo = document.querySelector('#localVideo');
//var remoteVideo = document.querySelector('#remoteVideo');
var videos = document.querySelector('#remoteVideos');

function handleUserMedia(stream) {
  console.log('Adding local stream.');
  localVideo.src = window.URL.createObjectURL(stream);
  localStream = stream;
  sendMessage('got user media', clientID, -1);
}

function handleUserMediaError(error){
  console.log('getUserMedia error: ', error);
}

var constraints = {video: true};
getUserMedia(constraints, handleUserMedia, handleUserMediaError);

console.log('Getting user media with constraints', constraints);

if (location.hostname != "localhost") {
  requestTurn('https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913');
}

function maybeStart() {
  if (typeof localStream != 'undefined' && isChannelReady) {
    createPeerConnection();
    pc.addStream(localStream);
    isStarted = true;
    console.log('clientID :', clientID);
    if (clientID == 0) {
      doCall();
    }
  }
}

window.onbeforeunload = function(e){
	sendMessage('bye', clientID, -1);
}

/////////////////////////////////////////////////////////

function createPeerConnection() {
  try {
    pc = new RTCPeerConnection(null);
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = handleRemoteStreamRemoved;
    console.log('Created RTCPeerConnnection');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
      return;
  }
}

function handleIceCandidate(event) {
  console.log('handleIceCandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate}, clientID
      , remoteClientID);
  } else {
    console.log('End of candidates.');
  }
}

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  if(clientID == 0) {
    var remoteVideo = document.createElement('video');
    remoteVideo.setAttribute('id','"remoteVideo_" + remoteClientID'); 
    remoteVideo.autoplay = 'true';
    
    //console.log('"I am video child remoteVideo_ " + remoteClientID');
    remoteVideo.src = window.URL.createObjectURL(event.stream);
    videos.appendChild(remoteVideo);
    for(var i=0; i<videos.childNodes.length; i++) {
       var child = videos.childNodes[i];
       child.width = '200';
       child.height = '200';
       console.log(child.width);
    }
    console.log(videos.childNodes.length);
    remoteStream = event.stream;
  }
  else
  {
    var remoteVideo = document.querySelector('#remoteVideo');
    remoteVideo.src = window.URL.createObjectURL(event.stream);
    remoteStream = event.stream;
  }
    
      
}

function handleCreateOfferError(event){
  console.log('createOffer() error: ', e);
}

function doCall() {
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
  console.log('Sending answer to peer.');
  pc.createAnswer(setLocalAndSendMessage, null, sdpConstraints);
}

function setLocalAndSendMessage(sessionDescription) {
  // Set Opus as the preferred codec in SDP if Opus is present.
  sessionDescription.sdp = preferOpus(sessionDescription.sdp);
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message' , sessionDescription);
  sendMessage(sessionDescription, clientID, remoteClientID);
}

function requestTurn(turn_url) {
  var turnExists = false;
  for (var i in pc_config.iceServers) {
    if (pc_config.iceServers[i].url.substr(0, 5) === 'turn:') {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    console.log('Getting TURN server from ', turn_url);
    // No TURN server. Get one from computeengineondemand.appspot.com:
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function(){
      if (xhr.readyState === 4 && xhr.status === 200) {
        var turnServer = JSON.parse(xhr.responseText);
      	console.log('Got TURN server: ', turnServer);
        pc_config.iceServers.push({
          'url': 'turn:' + turnServer.username + '@' + turnServer.turn,
          'credential': turnServer.password
        });
        turnReady = true;
      }
    };
    xhr.open('GET', turn_url, true);
    xhr.send();
  }
}

/*function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteVideo.src = window.URL.createObjectURL(event.stream);
  remoteStream = event.stream;
}*/

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage('bye', clientID, -1);
}

function handleRemoteHangup() {
//  console.log('Session terminated.');
  // stop();
  // isInitiator = false;
}

function stop() {
  isStarted = false;
  // isAudioMuted = false;
  // isVideoMuted = false;
  pc.close();
  pc = null;
}

///////////////////////////////////////////

// Set Opus as the default audio codec if it's present.
function preferOpus(sdp) {
  var sdpLines = sdp.split('\r\n');
  var mLineIndex;
  // Search for m line.
  for (var i = 0; i < sdpLines.length; i++) {
      if (sdpLines[i].search('m=audio') !== -1) {
        mLineIndex = i;
        break;
      }
  }
  if (mLineIndex === null) {
    return sdp;
  }

  // If Opus is available, set it as the default in m line.
  for (i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('opus/48000') !== -1) {
      var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
      if (opusPayload) {
        sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
      }
      break;
    }
  }

  // Remove CN in m line and sdp.
  sdpLines = removeCN(sdpLines, mLineIndex);

  sdp = sdpLines.join('\r\n');
  return sdp;
}

function extractSdp(sdpLine, pattern) {
  var result = sdpLine.match(pattern);
  return result && result.length === 2 ? result[1] : null;
}

// Set the selected codec to the first in m line.
function setDefaultCodec(mLine, payload) {
  var elements = mLine.split(' ');
  var newLine = [];
  var index = 0;
  for (var i = 0; i < elements.length; i++) {
    if (index === 3) { // Format of media starts from the fourth.
      newLine[index++] = payload; // Put target payload to the first.
    }
    if (elements[i] !== payload) {
      newLine[index++] = elements[i];
    }
  }
  return newLine.join(' ');
}

// Strip CN from sdp before CN constraints is ready.
function removeCN(sdpLines, mLineIndex) {
  var mLineElements = sdpLines[mLineIndex].split(' ');
  // Scan from end for the convenience of removing an item.
  for (var i = sdpLines.length-1; i >= 0; i--) {
    var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
    if (payload) {
      var cnPos = mLineElements.indexOf(payload);
      if (cnPos !== -1) {
        // Remove CN payload from m line.
        mLineElements.splice(cnPos, 1);
      }
      // Remove CN line in sdp
      sdpLines.splice(i, 1);
    }
  }

  sdpLines[mLineIndex] = mLineElements.join(' ');
  return sdpLines;
}


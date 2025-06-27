'use strict'

import { TURN_SERVER_IP } from './config.js';

const srcRoomId = ()=>document.querySelector('#src').value; // local room id
const dstRoomId = ()=>document.querySelector('#room').value; // remote room id

var remoteVideo = document.querySelector('video#remotevideo'); // remote video

var btnConn = document.querySelector('button#connserver');
var btnCall = document.querySelector('button#call');
var btnLeave = document.querySelector('button#leave');

var offerDisplay = document.querySelector('textarea#offer');
var answerDisplay = document.querySelector('textarea#answer');

var pcConfig = {
    'iceServers': [
        {
            'urls': `turn:${TURN_SERVER_IP}:3478`,
            'username': "test",            
            'credential': "test123"
        }
    ],    
    "iceTransportPolicy": "all",
    "bundlePolicy": "max-bundle",
    "rtcpMuxPolicy": "require",    
};

let m_local_data_channels = new Map()

const DATA_CHANNEL_FILE_TRANSPORT = "file-transport"
const DATA_CHANNEL_MOUSE_KEYBOARD = "mouse-keyboard"
const DATA_CHANNEL_CUSTOM_MESSAGE = "custom-message"


var remoteStream = null;
var pc = null; // PeerConnection
var socket = null;
var offerdesc = null;

function sendMessage(room, data) {
    if (!socket) {
        console.log('socket is null');
        return
    }
	data = JSON.stringify(data)
    let msg = {room, data, master:true, src:srcRoomId()}
              
    console.log('send message to ' + room);
    socket.emit('message', msg);
}

function conn() {
	socket = io('', {
	  path: '/socket.io/',
	  transports: ['websocket'],
	});

	socket.on('connect', ()=>{
		console.log('connect successfully')
	})

	socket.on('connect_failed', (err)=>{
		console.log(err)
	})

	socket.on('disconnect', (err)=>{
		console.log(err)
	})

	socket.on('error', (err)=>{
		console.log(err)
	})

	return
    //let t = setInterval(()=>{socket.emit('login', srcRoomId())}, 85000)
    
    socket.on('logined', ({room}) => {
        createPeerConnection();
        
        btnConn.disabled = true;
        btnLeave.disabled = false;
        console.log(room + 'logined.');
    });


    socket.on('disconnect', (socket) => {
        console.log('disconnected.');

        hangup();
    });


    socket.on('message', ({data}) => {
        console.log('receive message!');
        
        if (data === null || data === undefined) {
            console.error('the message is invalid!');
            return;
        }
        data = JSON.parse(data)

        if (data.hasOwnProperty('type') && data.type === 'offer') {
            offerDisplay.value = data.sdp;

            pc.setRemoteDescription(new RTCSessionDescription(data));

            pc.createAnswer()
                .then(getAnswer)
                .catch(handleAnswerError);

        } else if (data.hasOwnProperty('type') && data.type == 'answer') {
            answerDisplay.value = data.sdp;

            pc.setRemoteDescription(new RTCSessionDescription(data));

        } else if (data.hasOwnProperty('type') && data.type === 'candidate') {
            var candidate = new RTCIceCandidate({
                sdpMLineIndex: data.sdpMLineIndex,
                candidate: data.candidate
            });

            pc.addIceCandidate(candidate);
        } else {
            console.log('the message is invalid!', data);
        }
    });
    
    socket.emit('login', srcRoomId());
    return true;
}


function getRemoteStream(e) {
    console.log('getRemoteStream e:', e)

    remoteStream = e.streams[0];

    console.log('e.streams[0]:', e.streams[0])
    remoteVideo.srcObject = e.streams[0];
}


function handleOfferError(err) {
    console.error('Failed to create offer:', err);
}


function handleAnswerError(err) {
    console.error('Failed to create answer:', err);
}


function getAnswer(desc) {
    console.log('getAnswer desc:', desc)

    pc.setLocalDescription(desc);

    answerDisplay.value = desc.sdp;

    sendMessage(dstRoomId(), desc);
}

function getOffer(desc) {
    console.log('getOffer desc:', desc)

    pc.setLocalDescription(desc);

    offerDisplay.value = desc.sdp;

    offerdesc = desc;

    sendMessage(dstRoomId(), offerdesc);
}

/**
 * 功能： 创建PeerConnection 对象
 *
 * 返回值： 无
 */
function createPeerConnection() {
    if (pc) {
        console.log('the pc have be created!');
        return
    }

    console.log('create RTCPeerConnection!');

    pc = new RTCPeerConnection(pcConfig);

    {

        let channel = pc.createDataChannel(DATA_CHANNEL_MOUSE_KEYBOARD);
	    m_local_data_channels.set(DATA_CHANNEL_MOUSE_KEYBOARD, channel);
    }
    {

        let channel = pc.createDataChannel(DATA_CHANNEL_FILE_TRANSPORT);
	    m_local_data_channels.set(DATA_CHANNEL_FILE_TRANSPORT, channel);
    }
    {

        let channel = pc.createDataChannel(DATA_CHANNEL_CUSTOM_MESSAGE);
        channel.onopen = function(event) {
            let a = new Uint8Array(8)
            a[0] = 3
            a[1] = 1503
            a[2] = 1503>>8
            channel.send(a);
            console.log('channel.onopen');
          }

	    m_local_data_channels.set(DATA_CHANNEL_CUSTOM_MESSAGE, channel);
    }


    pc.onicecandidate = event => {
        console.log('onicecandidate event:', event)
        if (event.candidate) 
        {
            console.log("candidate：" + JSON.stringify(event.candidate.toJSON()));
                        

            sendMessage(dstRoomId(), {
                type: 'candidate',
                sdpMLineIndex: event.candidate.sdpMLineIndex,
                sdpMid: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            });
        } else {
                console.log('this is the end candidate');
        }
    }
    pc.ontrack = getRemoteStream;
}

function call() {
    if (!pc) {
        console.log('no peerconn.')
        return
    }
	var offerOptions = {
		offerToReceiveVideo: 1
	}

	pc.createOffer(offerOptions)
		.then(getOffer)
		.catch(handleOfferError);
}

function hangup() {
    if (!pc) {
        return;
    }

    offerdesc = null;


    pc.close();
    pc = null;
}

function leave() {

    socket.emit('logout', srcRoomId());


    hangup();

    offerDisplay.value = '';
    answerDisplay.value = '';
    btnConn.disabled = false;
    btnLeave.disabled = true;
}


btnConn.onclick = conn
btnLeave.onclick = leave;
btnCall.onclick = call

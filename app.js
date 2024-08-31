let peer;
let conn;
const chunkSize = 16 * 1024; // 16KB chunks
let myShortCode;
let myPeerId;

function generateShortCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function initPeer() {
    peer = new Peer();
    
    peer.on('open', (id) => {
        myPeerId = id;
        myShortCode = generateShortCode();
        document.getElementById('peerId').textContent = `Your Peer ID: ${myPeerId}`;
        document.getElementById('shortCode').textContent = `Your Short Code: ${myShortCode}`;
        generateQRCode(myPeerId);
        document.getElementById('connectionStatus').textContent = 'Waiting for connection...';
        broadcastShortCode();
    });

    peer.on('connection', (connection) => {
        conn = connection;
        setupConnection();
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        document.getElementById('connectionStatus').textContent = 'Error: ' + err.message;
    });

    // Check if there's a peer ID in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const peerIdFromUrl = urlParams.get('peer');
    if (peerIdFromUrl) {
        connectToPeer(peerIdFromUrl);
    }
}

function broadcastShortCode() {
    peer.on('connection', (conn) => {
        conn.on('data', (data) => {
            if (data.type === 'shortCodeRequest') {
                conn.send({ type: 'shortCodeResponse', shortCode: myShortCode, peerId: myPeerId });
            }
        });
    });
}

function generateQRCode(peerId) {
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = ''; // Clear previous QR code
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('peer', peerId);
    new QRCode(qrContainer, {
        text: currentUrl.toString(),
        width: 128,
        height: 128
    });
}

function connectToPeer(code) {
    if (code.length === 6) {
        requestPeerIdFromShortCode(code);
    } else {
        establishConnection(code);
    }
}

function requestPeerIdFromShortCode(shortCode) {
    document.getElementById('connectionStatus').textContent = 'Searching for peer...';
    let foundPeer = false;

    // Connect to all available peers and ask for their short code
    peer.listAllPeers((peerIds) => {
        peerIds.forEach((peerId) => {
            if (peerId !== myPeerId) {
                let tempConn = peer.connect(peerId);
                tempConn.on('open', () => {
                    tempConn.send({ type: 'shortCodeRequest' });
                });
                tempConn.on('data', (data) => {
                    if (data.type === 'shortCodeResponse' && data.shortCode === shortCode) {
                        foundPeer = true;
                        tempConn.close();
                        establishConnection(data.peerId);
                    }
                });
            }
        });

        // If no peer is found after checking all peers, show an error
        setTimeout(() => {
            if (!foundPeer) {
                document.getElementById('connectionStatus').textContent = 'Peer not found. Please try again.';
            }
        }, 5000); // Wait for 5 seconds before showing the error
    });
}

function establishConnection(peerId) {
    conn = peer.connect(peerId);
    setupConnection();
}

function setupConnection() {
    conn.on('open', () => {
        document.getElementById('connectionStatus').textContent = 'Connected to peer';
        document.getElementById('sendButton').disabled = false;
    });

    conn.on('data', (data) => {
        if (data.type === 'file-start') {
            receiveFile(data);
        } else if (data.type === 'file-chunk') {
            receiveChunk(data);
        }
    });
}

function sendFile(file) {
    const fileReader = new FileReader();
    let offset = 0;

    fileReader.onload = (e) => {
        const chunk = e.target.result;
        conn.send({
            type: 'file-chunk',
            name: file.name,
            data: chunk,
            offset: offset,
            total: file.size
        });

        offset += chunk.byteLength;
        updateProgress(file.name, offset / file.size * 100);

        if (offset < file.size) {
            readNextChunk();
        }
    };

    const readNextChunk = () => {
        const slice = file.slice(offset, offset + chunkSize);
        fileReader.readAsArrayBuffer(slice);
    };

    conn.send({
        type: 'file-start',
        name: file.name,
        size: file.size
    });

    readNextChunk();
}

let receivingFile = null;

function receiveFile(data) {
    receivingFile = {
        name: data.name,
        size: data.size,
        data: new Uint8Array(data.size),
        receivedSize: 0
    };
    addFileToList(receivingFile, 'download');
}

function receiveChunk(data) {
    if (!receivingFile) return;

    const chunk = new Uint8Array(data.data);
    receivingFile.data.set(chunk, data.offset);
    receivingFile.receivedSize += chunk.length;

    updateProgress(receivingFile.name, receivingFile.receivedSize / receivingFile.size * 100);

    if (receivingFile.receivedSize === receivingFile.size) {
        const blob = new Blob([receivingFile.data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = receivingFile.name;
        a.click();
        URL.revokeObjectURL(url);
        receivingFile = null;
    }
}

function updateProgress(fileName, progress) {
    const fileItem = document.querySelector(`.file-item[data-name="${fileName}"]`);
    if (fileItem) {
        const progressBar = fileItem.querySelector('.progress');
        progressBar.style.width = `${progress}%`;
        progressBar.textContent = `${Math.round(progress)}%`;
    }
}

function addFileToList(file, type = 'upload') {
    const fileList = document.getElementById('fileList');
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    fileItem.setAttribute('data-name', file.name);
    fileItem.innerHTML = `
        <span>${file.name}</span>
        <div class="progress-bar">
            <div class="progress" style="width: 0%">0%</div>
        </div>
    `;
    fileList.appendChild(fileItem);
}

document.addEventListener('DOMContentLoaded', () => {
    initPeer();

    document.getElementById('connectButton').addEventListener('click', () => {
        const peerIdInput = document.getElementById('peerIdInput').value;
        connectToPeer(peerIdInput);
    });

    document.getElementById('sendButton').addEventListener('click', () => {
        const files = document.getElementById('fileInput').files;
        for (const file of files) {
            addFileToList(file);
            sendFile(file);
        }
    });
});

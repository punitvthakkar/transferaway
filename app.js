let peer;
let conn;
const chunkSize = 16 * 1024; // 16KB chunks

function initPeer() {
    peer = new Peer();
    
    peer.on('open', (id) => {
        document.getElementById('peerId').textContent = `Your Peer ID: ${id}`;
        document.getElementById('connectionStatus').textContent = 'Waiting for connection...';
    });

    peer.on('connection', (connection) => {
        conn = connection;
        setupConnection();
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        document.getElementById('connectionStatus').textContent = 'Error: ' + err.message;
    });
}

function connectToPeer() {
    const peerId = document.getElementById('peerIdInput').value;
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

    document.getElementById('connectButton').addEventListener('click', connectToPeer);

    document.getElementById('sendButton').addEventListener('click', () => {
        const files = document.getElementById('fileInput').files;
        for (const file of files) {
            addFileToList(file);
            sendFile(file);
        }
    });
});
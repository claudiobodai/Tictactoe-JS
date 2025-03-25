const roomsSection = document.getElementById('rooms-section');
const gameSection = document.getElementById('game-section');
const roomButtons = document.querySelectorAll('.room-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const roomNameInput = document.getElementById('room-name');
const leaveRoomButton = document.getElementById('leave-room');


roomButtons.forEach(button => {
    button.addEventListener('click', () => {
        const roomName = button.dataset.room;
        if (gameState.playerNickname) {
            joinRoom(roomName);
        } else {
            // Se il nickname non è impostato, mostra il campo per il nickname
            nicknameContainer.style.display = 'block';
            roomsSection.style.display = 'none';
            showMessage("Per favore, imposta un nickname prima di entrare in una stanza.", "error");
        }
    });
});

// Aggiungi l'evento per creare una nuova stanza
createRoomBtn.addEventListener('click', () => {
    const roomName = roomNameInput.value.trim();
    if (roomName) {
        if (gameState.playerNickname) {
            joinRoom(roomName);
            roomNameInput.value = '';
        } else {
            nicknameContainer.style.display = 'block';
            roomsSection.style.display = 'none';
            showMessage("Per favore, imposta un nickname prima di creare una stanza.", "error");
        }
    } else {
        showMessage("Inserisci un nome valido per la stanza.", "error");
    }
});

// Aggiungi l'evento per lasciare la stanza
leaveRoomButton.addEventListener('click', () => {
    if (gameState.currentRoom) {
        socket.emit('leaveRoom', { room: gameState.currentRoom });
        gameState.currentRoom = null;
        gameState.playerSymbol = null;
        
        
        gameSection.style.display = 'none';
        roomsSection.style.display = 'block';
        
        // Mostra di nuovo il campo per il nickname
        nicknameContainer.style.display = 'block';
        const playerDisplay = document.getElementById('player-display');
        if (playerDisplay) {
            playerDisplay.style.display = 'none';
        }
        
        resetBoard();
    }
});

// Funzione per entrare in una stanza
function joinRoom(roomName) {
    if (!gameState.playerNickname) {
        // Se il nickname non è stato impostato, mostra il campo per il nickname
        nicknameContainer.style.display = 'block';
        roomsSection.style.display = 'none';
        showMessage("Per favore, imposta un nickname prima di entrare in una stanza.", "error");
        return;
    }
    
    socket.emit('joinRoom', { room: roomName, nickname: gameState.playerNickname });
    gameState.currentRoom = roomName;
    roomsSection.style.display = 'none';
    gameSection.style.display = 'block';
    showMessage(`Sei entrato nella stanza: ${roomName}. Ora puoi iniziare a giocare!`);
    
    // Aggiorna la visualizzazione del giocatore
    const playerNicknameEl = document.getElementById('player-nickname');
    const playerDisplay = document.getElementById('player-display');
    if (playerNicknameEl && playerDisplay) {
        playerNicknameEl.textContent = gameState.playerNickname;
        playerDisplay.style.display = 'block';
    }
}


function resetBoard() {

    cells.forEach(cell => {
        cell.textContent = '';
        cell.className = 'cell';
    });

    gameState.board = Array(9).fill('');
    gameState.isGameOver = false;
    gameState.ready = false;
    gameState.currentPlayer = null;
    
    showMessage("Tabellone resettato.");
}
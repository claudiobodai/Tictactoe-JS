const socket = io();

socket.on('connect', () => {
    console.log(`Connesso al server con ID: ${socket.id}`);
});

const cells = document.querySelectorAll('.cell');
const resetButton = document.getElementById('reset');
const messageEl = document.getElementById('message');
const readyButton = document.getElementById('ready');
const chatMessages = document.getElementById('chat-messages');
const chatMessageInput = document.getElementById('chat-message');
const sendMessageButton = document.getElementById('send-message');
const historyButton = document.getElementById('show-history');
const historyContainer = document.getElementById('history-container');
const historyList = document.getElementById('history-list');
const closeHistoryButton = document.getElementById('close-history');

const gameState = {
    currentRoom: null,
    playerSymbol: null,
    playerNickname: "",
    board: Array(9).fill(''),
    isGameOver: false,
    currentPlayer: null,
    players: [],
    ready: false,
    lastMoveIndex: -1,
    gameHistory: []
};

socket.on('roleAssigned', (data) => {
    gameState.playerSymbol = data.symbol;
    gameState.currentPlayer = data.currentPlayer || data.symbol; // Fallback al simbolo se currentPlayer non è definito
    console.log(`Simbolo assegnato: ${gameState.playerSymbol}`);
    
    // Aggiorna il display del giocatore
    const playerNicknameEl = document.getElementById('player-nickname');
    const playerSymbolEl = document.getElementById('player-symbol');
    const playerDisplay = document.getElementById('player-display');
    
    if (playerNicknameEl && playerSymbolEl && playerDisplay) {
        playerNicknameEl.textContent = gameState.playerNickname;
        playerSymbolEl.textContent = ` (${gameState.playerSymbol})`;
        playerDisplay.style.display = 'block';
    }
    
    if (data.opponent) {
        showMessage(`Sei stato assegnato come ${gameState.playerSymbol}. Il tuo avversario è ${data.opponent}.`, "info");
    } else {
        showMessage(`Sei stato assegnato come ${gameState.playerSymbol}. Attendi che un avversario si unisca.`, "info");
    }
    updateMessage();
});

socket.on('gameWaiting', (data) => {
    showMessage(data.message, "info");
    readyButton.disabled = false;
    readyButton.textContent = "Pronto";
    gameState.ready = false;
    
    console.log("Ricevuto evento gameWaiting: in attesa che i giocatori siano pronti");
    
    // Assicurati che tutte le celle siano disabilitate in modalità attesa
    cells.forEach(cell => {
        cell.classList.add('disabled');
    });
});

socket.on('gameStart', (data) => {
    // Resetta completamente il tabellone all'inizio di una nuova partita
    gameState.board = data.board;
    gameState.currentPlayer = data.currentPlayer;
    gameState.isGameOver = false;
    gameState.lastMoveIndex = -1;
    
    console.log("Nuova partita iniziata:", {
        currentPlayer: gameState.currentPlayer, 
        playerSymbol: gameState.playerSymbol,
        isGameOver: gameState.isGameOver
    });
    
    updateBoard();
    updateMessage();
    
    showMessage(`La partita è iniziata! È il turno di ${gameState.currentPlayer}.`, "turn");
    
    // Disabilita entrambi i bottoni durante la partita
    readyButton.disabled = true;
    resetButton.disabled = true;
    
    // Rimuovi la classe disabled dalle celle vuote se è il tuo turno
    if (gameState.currentPlayer === gameState.playerSymbol) {
        cells.forEach(cell => {
            const index = parseInt(cell.dataset.index);
            if (gameState.board[index] === '') {
                cell.classList.remove('disabled');
                cell.classList.add('current-turn');
            }
        });
    }
});

socket.on('updateGame', (data) => {
    gameState.board = data.board;
    gameState.currentPlayer = data.currentPlayer;
    gameState.lastMoveIndex = data.lastMoveIndex !== undefined ? data.lastMoveIndex : -1;
    
    console.log("Aggiornamento gioco:", {
        currentPlayer: gameState.currentPlayer, 
        lastMove: gameState.lastMoveIndex
    });
    
    updateBoard();
    updateMessage();
});

socket.on('gameOver', (result) => {
    gameState.isGameOver = true;
    
    console.log("Fine partita:", result);
    
    if (result.draw) {
        showMessage("La partita è finita in pareggio!", "info");
        addChatMessage({ sender: "Sistema", message: "La partita è finita in pareggio!" });
    } else {
        showMessage(`${result.winner} ha vinto!`, "success");
        addChatMessage({ sender: "Sistema", message: `${result.winner} ha vinto!` });
        // Passa la combinazione vincente e l'ultima mossa
        updateBoard(result.winningCombination, result.lastMoveIndex);
    }
    
    // Dopo la fine della partita, abilita SOLO il bottone reset
    resetButton.disabled = false;
    
    // Il bottone "Pronto" deve rimanere disabilitato fino al reset
    readyButton.disabled = true;
    readyButton.textContent = "Pronto";
    gameState.ready = false;
    
    // Disabilita tutte le celle per prevenire ulteriori mosse
    cells.forEach(cell => {
        cell.classList.add('disabled');
    });
});

socket.on('playerConnected', (data) => {
    gameState.players = data.players.map(nickname => ({
        nickname,
        ready: false,
        symbol: nickname === gameState.playerNickname ? gameState.playerSymbol : (gameState.playerSymbol === 'X' ? 'O' : 'X')
    }));
    updateMessage();
    addChatMessage({ sender: "Sistema", message: `${data.nickname} si è unito alla stanza.` });
});

socket.on('playerLeft', (nickname) => {
    addChatMessage({ sender: "Sistema", message: `${nickname} ha lasciato la stanza.` });
});

socket.on('newMessage', (data) => {
    addChatMessage(data);
});

socket.on('gameHistoryUpdate', (history) => {
    gameState.gameHistory = history;
    updateHistoryDisplay();
});

function updateBoard(winningCombination = [], lastMoveIndex = -1) {
    cells.forEach(cell => {
        const index = parseInt(cell.dataset.index);
        cell.textContent = gameState.board[index];
        cell.className = 'cell';

        if (gameState.board[index] !== '') {
            cell.classList.add('taken');
            cell.classList.add(gameState.board[index] === 'X' ? 'x' : 'o');
        }

        // Evidenzia le celle della combinazione vincente
        if (winningCombination.includes(index)) {
            cell.classList.add('winning-cell');
        }

        // Evidenzia l'ultima mossa
        if (index === lastMoveIndex || index === gameState.lastMoveIndex) {
            cell.classList.add('last-move');
        }

        // Controlla se la cella dovrebbe essere giocabile
        const isPlayable = !gameState.isGameOver && 
                          gameState.board[index] === '' && 
                          gameState.currentPlayer === gameState.playerSymbol &&
                          gameState.players.length === 2 && 
                          gameState.players.every(p => p.ready);
        
        // Aggiungi current-turn se è giocabile e è il turno attuale
        if (isPlayable) {
            cell.classList.add('current-turn');
            cell.classList.remove('disabled');
        } else {
            cell.classList.add('disabled');
        }
    });
}

function updateMessage(message, type) {
    if (message) {
        showMessage(message, type);
        return;
    }
    
    if (gameState.isGameOver) {
        // Non aggiornare il messaggio se la partita è finita
        return;
    }
    
    if (gameState.currentPlayer === gameState.playerSymbol) {
        showMessage(`È il tuo turno (${gameState.playerSymbol}).`, "turn");
    } else {
        const opponent = gameState.players.find(p => p.symbol !== gameState.playerSymbol);
        const opponentName = opponent ? opponent.nickname : "dell'avversario";
        showMessage(`Turno di ${opponentName} (${gameState.currentPlayer}).`, "waiting");
    }
}

function showMessage(message, type = "info") {
    messageEl.textContent = message;
    messageEl.classList.remove("error", "success", "info", "turn", "waiting");
    messageEl.classList.add(type);
}

function makeMove(index) {
    // Log per debug
    console.log("Tentativo di mossa:", index, "Stato attuale:", {
        isCellEmpty: gameState.board[index] === '',
        isGameOver: gameState.isGameOver,
        isCurrentPlayer: gameState.playerSymbol === gameState.currentPlayer,
        playersCount: gameState.players.length,
        allReady: gameState.players.every(p => p.ready)
    });
    
    // Controlla che l'indice sia valido
    if (index < 0 || index > 8) return;
    
    // Controlla tutte le condizioni che potrebbero impedire la mossa
    if (gameState.board[index] !== '' || 
        gameState.isGameOver || 
        gameState.playerSymbol !== gameState.currentPlayer || 
        gameState.players.length !== 2 || 
        !gameState.players.every(p => p.ready)) { 
        return;
    }
    
    // Se tutte le condizioni sono soddisfatte, invia la mossa
    socket.emit('makeMove', {
        player: gameState.playerSymbol,
        index,
        room: gameState.currentRoom
    });
}

// Event Listener per le celle usando arrow functions
cells.forEach(cell => {
    cell.addEventListener('click', () => {
        const index = parseInt(cell.dataset.index);
        makeMove(index);
    });
});

resetButton.addEventListener('click', () => {
    console.log("Reset button clicked. Current state:", gameState);
    
    // Invia la richiesta di reset al server
    socket.emit('resetGame', { room: gameState.currentRoom });
    
    // Il resetButton verrà disabilitato dopo l'invio della richiesta
    resetButton.disabled = true;
    
    // Messaggio per indicare che è stato richiesto un reset
    showMessage("Reset richiesto. Attendere...", "info");
});

readyButton.addEventListener('click', () => {
    if (!gameState.ready) {
        console.log('Pronto: invio evento ready');
        socket.emit('ready', { room: gameState.currentRoom });
        gameState.ready = true;
        readyButton.textContent = "Aspetta che l'altro giocatore sia pronto";
        readyButton.disabled = true;
    }
});

socket.on('playerReady', (data) => {
    console.log(`Giocatore pronto: ${data.nickname}`);
    
    // Aggiorna lo stato del giocatore pronto
    const player = gameState.players.find(p => p.nickname === data.nickname);
    if (player) {
        player.ready = true;
    }
    
    // Controlla se entrambi i giocatori sono pronti e se ci sono 2 giocatori
    if (gameState.players.length === 2 && gameState.players.every(p => p.ready)) {
        showMessage("Entrambi i giocatori sono pronti. La partita sta per iniziare!", "success");
    }
});

socket.on('gameReset', (data) => {
    // Resetta lo stato del gioco completamente
    gameState.board = data.board;
    gameState.currentPlayer = data.currentPlayer;
    gameState.isGameOver = false;
    gameState.ready = false;
    gameState.lastMoveIndex = -1;
    
    // Aggiorna il tabellone con il nuovo stato vuoto
    updateBoard();
    
    // Dopo il reset, mostra un messaggio e abilita il bottone "Pronto"
    showMessage("Il tabellone è stato resettato. Premi 'Pronto' per iniziare una nuova partita!", "info");
    
    // Abilita il bottone "Pronto" e reimposta il testo
    readyButton.disabled = false;
    readyButton.textContent = "Pronto";
    
    // Disabilita il bottone reset fino a quando la nuova partita non sarà iniziata
    resetButton.disabled = true;
    
    // Log per debug
    console.log("Tabellone resettato, stato di gioco:", gameState);
});

// Mostra lo storico delle partite
historyButton.addEventListener('click', () => {
    // Richiedi l'aggiornamento dello storico
    socket.emit('requestGameHistory', { room: gameState.currentRoom });
    historyContainer.style.display = 'block';
});

closeHistoryButton.addEventListener('click', () => {
    historyContainer.style.display = 'none';
});

function updateHistoryDisplay() {
    historyList.innerHTML = '';
    
    if (gameState.gameHistory.length === 0) {
        const noHistoryItem = document.createElement('div');
        noHistoryItem.className = 'history-item';
        noHistoryItem.textContent = 'Nessuna partita giocata finora.';
        historyList.appendChild(noHistoryItem);
        return;
    }

    gameState.gameHistory.forEach((game, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        const headerDiv = document.createElement('div');
        headerDiv.className = 'history-header';
        
        // Formatta la data
        const date = new Date(game.timestamp);
        const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
        
        if (game.draw) {
            headerDiv.innerHTML = `<strong>Partita #${index + 1}</strong> - ${formattedDate} - Pareggio`;
        } else {
            headerDiv.innerHTML = `<strong>Partita #${index + 1}</strong> - ${formattedDate} - Vincitore: ${game.winner} (${game.symbol})`;
        }
        
        historyItem.appendChild(headerDiv);
        
        // Crea una mini board per visualizzare la partita
        const miniBoard = document.createElement('div');
        miniBoard.className = 'mini-board';
        
        for (let i = 0; i < 9; i++) {
            const miniCell = document.createElement('div');
            miniCell.className = 'mini-cell';
            
            // Imposta il valore della cella
            if (game.board && game.board[i]) {
                miniCell.textContent = game.board[i];
                miniCell.classList.add(game.board[i] === 'X' ? 'x' : 'o');
            }
            
            // Evidenzia le celle della combinazione vincente
            if (game.winningCombination && game.winningCombination.includes(i)) {
                miniCell.classList.add('winning-cell');
            }
            
            miniBoard.appendChild(miniCell);
        }
        
        historyItem.appendChild(miniBoard);
        historyList.appendChild(historyItem);
    });
}

function addChatMessage(data) {
    // Controllo per evitare messaggi duplicati
    const allMessages = chatMessages.querySelectorAll('.chat-message');
    if (allMessages.length > 0) {
        const lastMessage = allMessages[allMessages.length - 1];
        const lastSender = lastMessage.querySelector('.sender');
        const lastText = lastMessage.querySelector('.message-text');
        
        // Se il messaggio è identico all'ultimo, lo ignoriamo
        if (lastSender && lastText && 
            lastSender.textContent === data.sender && 
            lastText.textContent === data.message) {
            console.log("Messaggio duplicato ignorato");
            return;
        }
    }

    // Controlla se l'utente è vicino al fondo della chat prima di aggiungere il messaggio
    const isNearBottom = chatMessages.scrollTop + chatMessages.clientHeight >= chatMessages.scrollHeight - 50;

    const messageElement = document.createElement('div');
    
    // Distingui tra messaggi di sistema e messaggi normali
    if (data.sender === 'Sistema') {
        messageElement.className = 'chat-message system-message';
        messageElement.textContent = data.message;
    } else {
        // Messaggi normali (miei o di altri)
        messageElement.className = `chat-message ${data.sender === gameState.playerNickname ? 'my-message' : 'other-message'}`;
        
        const senderElement = document.createElement('div');
        senderElement.className = 'sender';
        senderElement.textContent = data.sender;

        const textElement = document.createElement('div');
        textElement.className = 'message-text';
        textElement.textContent = data.message;

        messageElement.appendChild(senderElement);
        messageElement.appendChild(textElement);
    }
    
    // Aggiungi il messaggio alla chat
    chatMessages.appendChild(messageElement);
    
    // Limita il numero di messaggi a 100
    const MAX_MESSAGES = 100;
    const currentMessages = chatMessages.querySelectorAll('.chat-message');
    
    if (currentMessages.length > MAX_MESSAGES) {
        // Rimuovi i messaggi in eccesso
        const messagesToRemove = currentMessages.length - MAX_MESSAGES;
        for (let i = 0; i < messagesToRemove; i++) {
            if (chatMessages.firstChild) {
                chatMessages.removeChild(chatMessages.firstChild);
            }
        }
    }
    
    // Scorri in basso solo se l'utente era già vicino al fondo
    if (isNearBottom) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Funzione per monitorare la chat e correggere problemi di visualizzazione
function setupChatMonitoring() {
    // Verifica periodicamente se ci sono problemi di layout nei messaggi
    setInterval(() => {
        const messages = document.querySelectorAll('.chat-message');
        messages.forEach(msg => {
            // Controlla se il contenuto del messaggio è visibile
            const messageText = msg.querySelector('.message-text');
            if (messageText && messageText.offsetHeight === 0) {
                // Il testo è collassato, forza la ridisposizione
                messageText.style.display = 'none';
                setTimeout(() => {
                    messageText.style.display = 'block';
                }, 10);
            }
        });
    }, 5000); 
    
    // Aggiungi un listener per lo scroll della chat
    chatMessages.addEventListener('scroll', () => {
        // Quando l'utente scorre fino in fondo, considera che sta seguendo la chat
        if (chatMessages.scrollTop + chatMessages.clientHeight >= chatMessages.scrollHeight - 10) {
            chatMessages.dataset.autoScroll = 'true';
        } else {
            chatMessages.dataset.autoScroll = 'false';
        }
    });
}

// Chiama questa funzione all'avvio
document.addEventListener('DOMContentLoaded', setupChatMonitoring);

sendMessageButton.addEventListener('click', sendChatMessage);
chatMessageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
});

function sendChatMessage() {
    const message = chatMessageInput.value.trim();
    if (message && gameState.playerNickname) {
        console.log(`Invio messaggio chat: "${message}" da ${gameState.playerNickname}`);
        socket.emit('sendMessage', {
            message,
            sender: gameState.playerNickname,
            room: gameState.currentRoom
        });
        chatMessageInput.value = '';
    }
}
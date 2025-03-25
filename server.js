const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const gameHistory = {};

io.on('connection', (socket) => {
    console.log(`Nuovo giocatore connesso: ${socket.id}`);

    socket.on('joinRoom', (data) => {
        const { nickname, room } = data;
        if (!nickname || !room) {
            socket.emit('gameError', 'Dati mancanti');
            return;
        }
        console.log(`Giocatore ${nickname} si unisce alla stanza ${room}`);

        if (!rooms[room]) {
            rooms[room] = {
                players: [],
                board: Array(9).fill(''),
                currentPlayer: 'X',
                isGameOver: false,
                messages: []
            };
        }

        if (!gameHistory[room]) {
            gameHistory[room] = [];
        }

        const currentRoom = rooms[room];
        if (currentRoom.players.length >= 2) {
            socket.emit('gameError', 'La stanza è piena.');
            return;
        }

        const nicknameExists = currentRoom.players.some(player =>
            player.nickname.toLowerCase() === nickname.toLowerCase()
        );
        if (nicknameExists) {
            socket.emit('gameError', 'Nickname già in uso.');
            return;
        }

        const symbol = currentRoom.players.length === 0 ? 'X' : 'O';
        const playerData = {
            id: socket.id,
            symbol,
            nickname,
            room,
            ready: false
        };

        currentRoom.players.push(playerData);
        socket.join(room);

        socket.emit('roleAssigned', {
            symbol,
            currentPlayer: currentRoom.currentPlayer,
            opponent: currentRoom.players.length > 1 ? 
                currentRoom.players.find(p => p.id !== socket.id)?.nickname : 
                null
        });

        io.to(room).emit('playerConnected', {
            nickname,
            symbol,
            players: currentRoom.players.map(p => p.nickname)
        });

        io.to(room).emit('newMessage', {
            sender: 'Sistema',
            message: `${nickname} si è unito alla stanza.`
        });

        socket.emit('gameHistoryUpdate', gameHistory[room]);

        if (currentRoom.players.length === 2) {
            io.to(room).emit('gameWaiting', {
                message: 'Attendi che entrambi i giocatori siano pronti.'
            });
        }
    });

    socket.on('ready', (data) => {
        const { room } = data;
        const currentRoom = rooms[room];

        if (!currentRoom) {
            console.log(`Room ${room} non trovata`);
            return;
        }

        const player = currentRoom.players.find(p => p.id === socket.id);
        if (player) {
            console.log(`Giocatore ${player.nickname} pronto nella stanza ${room}`);
            player.ready = true;
            io.to(room).emit('playerReady', {
                nickname: player.nickname
            });

            // Controlla se entrambi i giocatori sono pronti
            const allPlayersReady = currentRoom.players.length === 2 && 
                                    currentRoom.players.every(p => p.ready);
                                    
            console.log(`Stanza ${room}: tutti i giocatori pronti: ${allPlayersReady}, gioco in corso: ${currentRoom.isGameOver}`);
            
            if (allPlayersReady && !currentRoom.isGameOver) {
                console.log(`Inizia nuova partita nella stanza ${room}`);
                
                // Breve ritardo prima di iniziare la partita per dare tempo all'interfaccia di aggiornarsi
                setTimeout(() => {
                    io.to(room).emit('gameStart', {
                        board: currentRoom.board,
                        currentPlayer: currentRoom.currentPlayer
                    });
                }, 1000);
            }
        }
    });

    socket.on('makeMove', (data) => {
        const { index, player, room } = data;
        console.log(`Mossa ricevuta: giocatore ${player}, indice ${index}, stanza ${room}`);
        
        const currentRoom = rooms[room];
        if (!currentRoom) {
            console.log(`Stanza ${room} non trovata`);
            return;
        }
        
        if (currentRoom.isGameOver) {
            console.log(`La partita è già finita nella stanza ${room}`);
            return;
        }

        const playerData = currentRoom.players.find(p => p.symbol === player);
        if (!playerData) {
            console.log(`Giocatore con simbolo ${player} non trovato`);
            return;
        }
        
        if (playerData.symbol !== currentRoom.currentPlayer) {
            console.log(`Non è il turno di ${playerData.nickname} (${player}), è il turno di ${currentRoom.currentPlayer}`);
            socket.emit('error', 'Mossa non valida');
            return;
        }

        if (currentRoom.board[index] !== '') {
            console.log(`Cella ${index} già occupata`);
            socket.emit('error', 'Cella già occupata');
            return;
        }

        // Esegui la mossa
        currentRoom.board[index] = player;
        console.log(`Mossa valida: giocatore ${playerData.nickname} (${player}) in posizione ${index}`);

        let gameResult = null;
        const winningCombination = checkWinner(currentRoom.board);
        
        if (winningCombination) {
            console.log(`Vittoria rilevata per ${playerData.nickname} (${player}), combinazione: ${winningCombination}`);
            
            gameResult = { 
                winner: playerData.nickname, 
                symbol: player, 
                winningCombination,
                lastMoveIndex: index
            };
            currentRoom.isGameOver = true;
            
            // Aggiungi la partita allo storico
            gameHistory[room].push({
                winner: playerData.nickname,
                symbol: player,
                winningCombination,
                timestamp: new Date().toISOString(),
                board: [...currentRoom.board]
            });
            
            // Limita lo storico a 10 partite per stanza
            if (gameHistory[room].length > 10) {
                gameHistory[room] = gameHistory[room].slice(-10);
            }
            
            // Aggiorna lo storico per tutti i giocatori nella stanza
            io.to(room).emit('gameHistoryUpdate', gameHistory[room]);
        } else if (currentRoom.board.every(cell => cell !== '')) {
            console.log(`Pareggio nella stanza ${room}`);
            
            gameResult = { draw: true, lastMoveIndex: index };
            currentRoom.isGameOver = true;
            
            // Aggiungi il pareggio allo storico
            gameHistory[room].push({
                draw: true,
                timestamp: new Date().toISOString(),
                board: [...currentRoom.board]
            });
            
            // Limita lo storico a 10 partite per stanza
            if (gameHistory[room].length > 10) {
                gameHistory[room] = gameHistory[room].slice(-10);
            }
            
            // Aggiorna lo storico per tutti i giocatori nella stanza
            io.to(room).emit('gameHistoryUpdate', gameHistory[room]);
        }

        // Invia l'aggiornamento del tabellone a tutti i giocatori
        io.to(room).emit('updateGame', {
            board: currentRoom.board,
            currentPlayer: currentRoom.currentPlayer,
            lastMoveIndex: index
        });

        if (gameResult) {
            console.log(`Fine partita nella stanza ${room}: ${gameResult.draw ? 'pareggio' : 'vincitore: ' + gameResult.winner}`);
            io.to(room).emit('gameOver', gameResult);
        } else {
            // Passa il turno al prossimo giocatore
            currentRoom.currentPlayer = currentRoom.currentPlayer === 'X' ? 'O' : 'X';
            console.log(`Turno passato a ${currentRoom.currentPlayer} nella stanza ${room}`);
            
            io.to(room).emit('updateGame', {
                board: currentRoom.board,
                currentPlayer: currentRoom.currentPlayer,
                lastMoveIndex: index
            });
        }
    });

    socket.on('sendMessage', (data) => {
        const { message, room } = data;
        const currentRoom = rooms[room];
        const player = currentRoom.players.find(p => p.id === socket.id);
        
        if (message.trim() && player) {
            const chatMessage = {
                message: message.trim(),
                sender: player.nickname,
                timestamp: Date.now()
            };
            
            currentRoom.messages.push(chatMessage);
            io.to(room).emit('newMessage', chatMessage);
        }
    });

    socket.on('disconnect', () => {
        const room = Object.keys(rooms).find(r => rooms[r].players.some(p => p.id === socket.id));
        if (!room) return;

        const currentRoom = rooms[room];
        const playerIndex = currentRoom.players.findIndex(p => p.id === socket.id);
        
        if (playerIndex !== -1) {
            const [disconnectedPlayer] = currentRoom.players.splice(playerIndex, 1);
            io.to(room).emit('playerLeft', disconnectedPlayer.nickname);
            io.to(room).emit('newMessage', {
                sender: 'Sistema',
                message: `${disconnectedPlayer.nickname} ha lasciato la stanza.`
            });

            if (currentRoom.players.length === 0) {
                delete rooms[room];
                
                // Non cancellare lo storico quando una stanza si svuota
                // Così quando un giocatore rientra può vedere lo storico precedente
                // gameHistory[room] rimane intatto
            }
        }
    });

    socket.on('resetGame', (data) => {
        const { room } = data;
        if (!room || !rooms[room]) {
            console.log(`Stanza ${room} non trovata durante il reset`);
            return;
        }
        
        const currentRoom = rooms[room];
        console.log(`Reset della stanza ${room}`);
        
        // Reset completo dello stato di gioco
        currentRoom.board = Array(9).fill('');
        currentRoom.currentPlayer = 'X';
        currentRoom.isGameOver = false;
        
        // Reset del flag "ready" per tutti i giocatori
        currentRoom.players.forEach(player => {
            player.ready = false;
            console.log(`Reset pronto per ${player.nickname}`);
        });
        
        // Notifica tutti i giocatori del reset
        io.to(room).emit('gameReset', {
            board: currentRoom.board,
            currentPlayer: currentRoom.currentPlayer
        });
        
        // Informa i giocatori che devono premere "Pronto" per iniziare una nuova partita
        io.to(room).emit('gameWaiting', {
            message: 'Tabellone resettato. Premi "Pronto" per iniziare una nuova partita.'
        });
        
        console.log(`Reset completato per la stanza ${room}`);
    });

    socket.on('leaveRoom', (data) => {
        const { room } = data;
        if (room && rooms[room]) {
            socket.leave(room);
            const currentRoom = rooms[room];
            const playerIndex = currentRoom.players.findIndex(p => p.id === socket.id);
            
            if (playerIndex !== -1) {
                const [leavingPlayer] = currentRoom.players.splice(playerIndex, 1);
                io.to(room).emit('playerLeft', leavingPlayer.nickname);
                io.to(room).emit('newMessage', {
                    sender: 'Sistema',
                    message: `${leavingPlayer.nickname} ha lasciato la stanza.`
                });
                
                if (currentRoom.players.length === 0) {
                    delete rooms[room];
                    
                    // Non cancelliamo lo storico quando la stanza si svuota
                    // gameHistory[room] rimane intatto
                }
            }
        }
    });
    
    // Nuovo evento per richiedere lo storico delle partite
    socket.on('requestGameHistory', (data) => {
        const { room } = data;
        if (room && gameHistory[room]) {
            socket.emit('gameHistoryUpdate', gameHistory[room]);
        } else {
            socket.emit('gameHistoryUpdate', []);
        }
    });
});

function checkWinner(board) {
    const winningCombinations = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];

    for (const combination of winningCombinations) {
        const [a, b, c] = combination;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return combination; // Restituisce la combinazione vincente
        }
    }
    return null;
}

server.listen(4000, () => {
    console.log('Server in esecuzione su http://localhost:4000');
});
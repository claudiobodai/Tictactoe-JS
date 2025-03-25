const nicknameInput = document.getElementById('nickname');
const nicknameButton = document.getElementById('setNickname');
const nicknameContainer = document.getElementById('nickname-container');
const playerNicknameEl = document.getElementById('player-nickname');

document.addEventListener('DOMContentLoaded', function() {
    const roomsSection = document.getElementById('rooms-section');
    roomsSection.style.display = 'none';

    const nicknameSection = document.getElementById('nickname-container');
    nicknameSection.style.display = 'block';
});

nicknameButton.addEventListener('click', function() {
    let nickname = nicknameInput.value.trim();
    if (nickname) {
        gameState.playerNickname = nickname;
        
        // Aggiorna la visualizzazione del giocatore
        if (playerNicknameEl) {
            playerNicknameEl.textContent = nickname;
            document.getElementById('player-display').style.display = 'block';
        }
        
        // Nascondi la sezione per il nickname e mostra le stanze
        nicknameContainer.style.display = 'none';
        
        document.getElementById('rooms-section').style.display = 'block';
        
        showMessage(`Benvenuto, ${nickname}! Seleziona una stanza per iniziare a giocare.`, "success");
    } else {
        showMessage("Per favore inserisci un nickname valido!", "error");
    }
});


nicknameInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        nicknameButton.click();
    }
});
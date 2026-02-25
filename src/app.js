// API base URL
const API_BASE = '/.netlify/functions';

// Tab switching
function showTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`[onclick="showTab('${tabName}')"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Load data for the tab
    if (tabName === 'teams') loadTeams();
    if (tabName === 'events') loadEvents();
    if (tabName === 'matches') loadEventsForSelect();
}

// Teams functions
async function loadTeams() {
    try {
        const response = await fetch(`${API_BASE}/teams`);
        const teams = await response.json();
        
        const teamsList = document.getElementById('teams-list');
        teamsList.innerHTML = teams.map(team => `
            <div class="list-item">
                <span>${team.name}</span>
                <button class="delete" onclick="deleteTeam(${team.id})">Delete</button>
            </div>
        `).join('');
        
        // Update team checkboxes in event creation
        updateTeamCheckboxes(teams);
    } catch (error) {
        console.error('Error loading teams:', error);
    }
}

async function addTeam() {
    const nameInput = document.getElementById('team-name');
    const name = nameInput.value.trim();
    
    if (!name) {
        alert('Please enter a team name');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/teams`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        
        if (response.ok) {
            nameInput.value = '';
            loadTeams();
        } else {
            const error = await response.json();
            alert(error.error || 'Error adding team');
        }
    } catch (error) {
        console.error('Error adding team:', error);
    }
}

async function deleteTeam(id) {
    if (!confirm('Are you sure you want to delete this team?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/teams/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadTeams();
        } else {
            const error = await response.json();
            alert(error.error || 'Error deleting team');
        }
    } catch (error) {
        console.error('Error deleting team:', error);
    }
}

function updateTeamCheckboxes(teams) {
    const container = document.getElementById('teams-checkboxes');
    container.innerHTML = teams.map(team => `
        <div class="checkbox-item">
            <input type="checkbox" value="${team.id}" id="team-${team.id}">
            <label for="team-${team.id}">${team.name}</label>
        </div>
    `).join('');
}

// Events functions
async function loadEvents() {
    try {
        const response = await fetch(`${API_BASE}/events`);
        const events = await response.json();
        
        const eventsList = document.getElementById('events-list');
        eventsList.innerHTML = events.map(event => `
            <div class="list-item">
                <span>
                    <strong>${event.name}</strong> 
                    (${event.type}) - ${event.status}
                </span>
                <button onclick="viewEvent(${event.id})">View Details</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading events:', error);
    }
}

async function createEvent() {
    const name = document.getElementById('event-name').value.trim();
    const type = document.getElementById('event-type').value;
    
    const selectedTeams = Array.from(document.querySelectorAll('#teams-checkboxes input:checked'))
        .map(cb => parseInt(cb.value));
    
    if (!name) {
        alert('Please enter an event name');
        return;
    }
    
    if (selectedTeams.length < 2) {
        alert('Please select at least 2 teams');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type, teams: selectedTeams })
        });
        
        if (response.ok) {
            document.getElementById('event-name').value = '';
            document.querySelectorAll('#teams-checkboxes input:checked').forEach(cb => cb.checked = false);
            loadEvents();
            alert('Event created successfully!');
        } else {
            const error = await response.json();
            alert(error.error || 'Error creating event');
        }
    } catch (error) {
        console.error('Error creating event:', error);
    }
}

// Matches functions
async function loadEventsForSelect() {
    try {
        const response = await fetch(`${API_BASE}/events`);
        const events = await response.json();
        
        const select = document.getElementById('match-event-select');
        select.innerHTML = '<option value="">Choose an event...</option>' +
            events.map(event => `<option value="${event.id}">${event.name} (${event.type})</option>`).join('');
    } catch (error) {
        console.error('Error loading events for select:', error);
    }
}

async function loadEventMatches() {
    const eventId = document.getElementById('match-event-select').value;
    
    if (!eventId) {
        document.getElementById('event-details').style.display = 'none';
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/events/${eventId}`);
        const event = await response.json();
        
        document.getElementById('event-details').style.display = 'block';
        document.getElementById('event-name-display').textContent = event.name;
        
        // Display standings for league events
        if (event.type === 'league' && event.standings) {
            displayStandings(event.standings);
        } else {
            document.getElementById('standings').innerHTML = '';
        }
        
        // Display matches
        displayMatches(event.matches, event.type);
    } catch (error) {
        console.error('Error loading event matches:', error);
    }
}

function displayStandings(standings) {
    const html = `
        <h3>Standings</h3>
        <table class="standings-table">
            <thead>
                <tr>
                    <th>Team</th>
                    <th>P</th>
                    <th>W</th>
                    <th>D</th>
                    <th>L</th>
                    <th>GF</th>
                    <th>GA</th>
                    <th>GD</th>
                    <th>Pts</th>
                </tr>
            </thead>
            <tbody>
                ${standings.map(s => `
                    <tr>
                        <td>${s.name}</td>
                        <td>${s.played}</td>
                        <td>${s.won}</td>
                        <td>${s.drawn}</td>
                        <td>${s.lost}</td>
                        <td>${s.goals_for}</td>
                        <td>${s.goals_against}</td>
                        <td>${s.goals_for - s.goals_against}</td>
                        <td><strong>${s.points}</strong></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    document.getElementById('standings').innerHTML = html;
}

function displayMatches(matches, eventType) {
    const html = `
        <h3>Matches</h3>
        ${matches.map(match => `
            <div class="match-item">
                <div class="match-teams">
                    <span>${match.team1_name || 'TBD'}</span>
                    <div class="match-score">
                        ${match.status === 'completed' ? 
                            `<span>${match.team1_score} - ${match.team2_score}</span>` :
                            `<input type="number" id="score1-${match.id}" min="0" value="0">
                             <span>-</span>
                             <input type="number" id="score2-${match.id}" min="0" value="0">`
                        }
                    </div>
                    <span>${match.team2_name || 'TBD'}</span>
                </div>
                ${match.status === 'scheduled' && match.team1_id && match.team2_id ?
                    `<button onclick="updateMatchScore(${match.id})">Update Score</button>` :
                    `<span class="match-status status-${match.status}">${match.status}</span>`
                }
            </div>
        `).join('')}
    `;
    
    document.getElementById('matches-list').innerHTML = html;
}

async function updateMatchScore(matchId) {
    const score1 = document.getElementById(`score1-${matchId}`).value;
    const score2 = document.getElementById(`score2-${matchId}`).value;
    
    if (score1 === '' || score2 === '') {
        alert('Please enter both scores');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/matches/${matchId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                team1_score: parseInt(score1), 
                team2_score: parseInt(score2) 
            })
        });
        
        if (response.ok) {
            loadEventMatches(); // Reload the matches
            alert('Match updated successfully!');
        } else {
            const error = await response.json();
            alert(error.error || 'Error updating match');
        }
    } catch (error) {
        console.error('Error updating match:', error);
    }
}

// View event details
async function viewEvent(eventId) {
    showTab('matches');
    document.getElementById('match-event-select').value = eventId;
    await loadEventMatches();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadTeams();
    loadEvents();
    loadEventsForSelect();
});
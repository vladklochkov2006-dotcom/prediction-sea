// Copyright (c) HoverWars
// SPDX-License-Identifier: Apache-2.0

/*! ABI of the HoverWars Game Application */

use async_graphql::{Request, Response};
use linera_sdk::linera_base_types::{ContractAbi, ServiceAbi};
use serde::{Deserialize, Serialize};

pub struct HoverWarsAbi;

impl ContractAbi for HoverWarsAbi {
    type Operation = Operation;
    type Response = ();
}

impl ServiceAbi for HoverWarsAbi {
    type Query = Request;
    type QueryResponse = Response;
}

// Team enum
#[derive(Debug, Clone, Copy, Serialize, Deserialize, async_graphql::Enum, PartialEq, Eq)]
pub enum Team {
    Blue,
    Red,
}

impl Default for Team {
    fn default() -> Self {
        Team::Blue
    }
}

// Player structure
#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct Player {
    pub chain_id: String,
    pub name: String,
    pub team: Team,
    pub score: u32,
}

// Match state enum
#[derive(Debug, Clone, Copy, Serialize, Deserialize, async_graphql::Enum, PartialEq, Eq)]
pub enum MatchState {
    WaitingForOpponent,
    InProgress,
    Finished,
}

impl Default for MatchState {
    fn default() -> Self {
        MatchState::WaitingForOpponent
    }
}

// Round result enum
#[derive(Debug, Clone, Copy, Serialize, Deserialize, async_graphql::Enum, PartialEq, Eq)]
pub enum RoundResult {
    BlueWin,
    RedWin,
    Draw,
}

// Round history entry
#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct RoundHistoryEntry {
    pub round_number: u32,
    pub result: RoundResult,
    pub blue_score_after: u32,
    pub red_score_after: u32,
    pub timestamp: String,
}

// Game room structure
#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct GameRoom {
    pub room_id: String,
    pub host_chain_id: String,
    pub blue_player: Player,
    pub red_player: Option<Player>,
    pub match_state: MatchState,
    pub current_round: u32,
    pub round_history: Vec<RoundHistoryEntry>,
    pub winner: Option<Team>,
    pub created_at: String,
}

// Operations
#[derive(Debug, Serialize, Deserialize)]
pub enum Operation {
    CreateLobby { host_name: String },
    JoinLobby { host_chain_id: String, player_name: String },
    ReportRoundResult { result: RoundResult },
    LeaveLobby,
}

// Events for cross-chain synchronization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum HoverWarsEvent {
    PlayerJoined { 
        player: Player, 
        timestamp: String 
    },
    MatchStarted { 
        blue_player_name: String, 
        red_player_name: String, 
        timestamp: String 
    },
    RoundCompleted { 
        round_number: u32, 
        result: RoundResult, 
        blue_score: u32, 
        red_score: u32, 
        timestamp: String 
    },
    MatchEnded { 
        winner: Option<Team>, 
        blue_score: u32, 
        red_score: u32, 
        timestamp: String 
    },
    PlayerLeft {
        player_chain_id: String,
        timestamp: String,
    },
}

// Cross-chain messages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CrossChainMessage {
    JoinRequest {
        player_chain_id: linera_sdk::linera_base_types::ChainId,
        player_name: String,
    },
    InitialStateSync {
        room_data: GameRoom,
    },
    RoundResultNotification {
        round_number: u32,
        result: RoundResult,
        blue_score: u32,
        red_score: u32,
        timestamp: String,
    },
    MatchEndNotification {
        winner: Option<Team>,
        blue_score: u32,
        red_score: u32,
        timestamp: String,
    },
    RoomDeleted {
        timestamp: String,
    },
    PlayerLeftNotification {
        player_chain_id: String,
        timestamp: String,
    },
}

impl GameRoom {
    pub fn new(host_chain_id: String, host_name: String, timestamp: String) -> Self {
        let blue_player = Player {
            chain_id: host_chain_id.clone(),
            name: host_name,
            team: Team::Blue,
            score: 0,
        };

        Self {
            room_id: timestamp.clone(),
            host_chain_id,
            blue_player,
            red_player: None,
            match_state: MatchState::WaitingForOpponent,
            current_round: 0,
            round_history: Vec::new(),
            winner: None,
            created_at: timestamp,
        }
    }

    pub fn add_red_player(&mut self, chain_id: String, name: String) {
        self.red_player = Some(Player {
            chain_id,
            name,
            team: Team::Red,
            score: 0,
        });
        self.match_state = MatchState::InProgress;
        self.current_round = 1;
    }

    pub fn apply_round_result(&mut self, result: RoundResult, timestamp: String) -> bool {
        // Apply score changes
        match result {
            RoundResult::BlueWin => {
                self.blue_player.score += 1;
            }
            RoundResult::RedWin => {
                if let Some(ref mut red) = self.red_player {
                    red.score += 1;
                }
            }
            RoundResult::Draw => {
                self.blue_player.score += 1;
                if let Some(ref mut red) = self.red_player {
                    red.score += 1;
                }
            }
        }

        let red_score = self.red_player.as_ref().map(|p| p.score).unwrap_or(0);

        // Record round history
        self.round_history.push(RoundHistoryEntry {
            round_number: self.current_round,
            result,
            blue_score_after: self.blue_player.score,
            red_score_after: red_score,
            timestamp,
        });

        // Check for winner (first to 3 wins)
        if self.blue_player.score >= 3 {
            self.winner = Some(Team::Blue);
            self.match_state = MatchState::Finished;
            return true;
        }
        if red_score >= 3 {
            self.winner = Some(Team::Red);
            self.match_state = MatchState::Finished;
            return true;
        }

        // Next round
        self.current_round += 1;
        false
    }

    pub fn get_blue_score(&self) -> u32 {
        self.blue_player.score
    }

    pub fn get_red_score(&self) -> u32 {
        self.red_player.as_ref().map(|p| p.score).unwrap_or(0)
    }
}

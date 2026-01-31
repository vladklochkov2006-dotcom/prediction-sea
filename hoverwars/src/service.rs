// Copyright (c) HoverWars
// SPDX-License-Identifier: Apache-2.0

#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;

use std::sync::Arc;

use async_graphql::{EmptySubscription, Object, Request, Response, Schema};
use linera_sdk::{linera_base_types::WithServiceAbi, views::View, Service, ServiceRuntime};
use hoverwars::{HoverWarsAbi, GameRoom, Player, Team, MatchState, RoundResult, RoundHistoryEntry};

use self::state::HoverWarsState;

linera_sdk::service!(HoverWarsService);

pub struct HoverWarsService {
    state: HoverWarsState,
    runtime: Arc<ServiceRuntime<Self>>,
}

impl WithServiceAbi for HoverWarsService {
    type Abi = HoverWarsAbi;
}

impl Service for HoverWarsService {
    type Parameters = ();

    async fn new(runtime: ServiceRuntime<Self>) -> Self {
        let state = HoverWarsState::load(runtime.root_view_storage_context())
            .await
            .expect("Failed to load state");
        HoverWarsService {
            state,
            runtime: Arc::new(runtime),
        }
    }

    async fn handle_query(&self, request: Request) -> Response {
        let room = self.state.room.get().clone();
        
        let schema = Schema::build(
            QueryRoot { room: room.clone() },
            MutationRoot { runtime: self.runtime.clone() },
            EmptySubscription,
        )
        .finish();
        
        schema.execute(request).await
    }
}

struct QueryRoot {
    room: Option<GameRoom>,
}

#[Object]
impl QueryRoot {
    /// Get the full game room data
    async fn room(&self) -> Option<&GameRoom> {
        self.room.as_ref()
    }
    
    /// Get current match state
    async fn match_state(&self) -> Option<MatchState> {
        self.room.as_ref().map(|r| r.match_state)
    }
    
    /// Get both players
    async fn players(&self) -> Vec<Player> {
        self.room.as_ref().map_or(Vec::new(), |r| {
            let mut players = vec![r.blue_player.clone()];
            if let Some(ref red) = r.red_player {
                players.push(red.clone());
            }
            players
        })
    }
    
    /// Get blue player info
    async fn blue_player(&self) -> Option<Player> {
        self.room.as_ref().map(|r| r.blue_player.clone())
    }
    
    /// Get red player info
    async fn red_player(&self) -> Option<Player> {
        self.room.as_ref().and_then(|r| r.red_player.clone())
    }
    
    /// Get blue player score
    async fn blue_score(&self) -> u32 {
        self.room.as_ref().map(|r| r.blue_player.score).unwrap_or(0)
    }
    
    /// Get red player score
    async fn red_score(&self) -> u32 {
        self.room.as_ref().and_then(|r| r.red_player.as_ref().map(|p| p.score)).unwrap_or(0)
    }
    
    /// Get blue player name
    async fn blue_player_name(&self) -> Option<String> {
        self.room.as_ref().map(|r| r.blue_player.name.clone())
    }
    
    /// Get red player name
    async fn red_player_name(&self) -> Option<String> {
        self.room.as_ref().and_then(|r| r.red_player.as_ref().map(|p| p.name.clone()))
    }
    
    /// Get current round number
    async fn current_round(&self) -> u32 {
        self.room.as_ref().map(|r| r.current_round).unwrap_or(0)
    }
    
    /// Get round history
    async fn round_history(&self) -> Vec<RoundHistoryEntry> {
        self.room.as_ref().map_or(Vec::new(), |r| r.round_history.clone())
    }
    
    /// Get winner team (None if match not finished)
    async fn winner(&self) -> Option<Team> {
        self.room.as_ref().and_then(|r| r.winner)
    }
    
    /// Get winner name (None if match not finished)
    async fn winner_name(&self) -> Option<String> {
        self.room.as_ref().and_then(|r| {
            r.winner.map(|team| match team {
                Team::Blue => r.blue_player.name.clone(),
                Team::Red => r.red_player.as_ref().map(|p| p.name.clone()).unwrap_or_default(),
            })
        })
    }
    
    /// Is match finished?
    async fn is_match_finished(&self) -> bool {
        self.room.as_ref().map(|r| r.match_state == MatchState::Finished).unwrap_or(false)
    }
    
    /// Is waiting for opponent?
    async fn is_waiting_for_opponent(&self) -> bool {
        self.room.as_ref().map(|r| r.match_state == MatchState::WaitingForOpponent).unwrap_or(false)
    }
    
    /// Get comprehensive game status
    async fn game_status(&self) -> Option<GameStatus> {
        self.room.as_ref().map(|r| GameStatus {
            match_state: r.match_state,
            blue_player_name: r.blue_player.name.clone(),
            red_player_name: r.red_player.as_ref().map(|p| p.name.clone()),
            blue_score: r.blue_player.score,
            red_score: r.red_player.as_ref().map(|p| p.score).unwrap_or(0),
            current_round: r.current_round,
            winner: r.winner,
            rounds_played: r.round_history.len() as u32,
        })
    }
}

#[derive(async_graphql::SimpleObject)]
struct GameStatus {
    match_state: MatchState,
    blue_player_name: String,
    red_player_name: Option<String>,
    blue_score: u32,
    red_score: u32,
    current_round: u32,
    winner: Option<Team>,
    rounds_played: u32,
}

struct MutationRoot {
    runtime: Arc<ServiceRuntime<HoverWarsService>>,
}

#[Object]
impl MutationRoot {
    /// Create a new game lobby (caller becomes Blue Team host)
    async fn create_lobby(&self, host_name: String) -> String {
        self.runtime.schedule_operation(&hoverwars::Operation::CreateLobby { 
            host_name: host_name.clone() 
        });
        format!("Lobby created by host '{}' as Blue Team", host_name)
    }
    
    /// Join an existing lobby (caller becomes Red Team)
    async fn join_lobby(&self, host_chain_id: String, player_name: String) -> String {
        self.runtime.schedule_operation(&hoverwars::Operation::JoinLobby { 
            host_chain_id: host_chain_id.clone(), 
            player_name: player_name.clone() 
        });
        format!("Join request sent to host '{}' by player '{}' as Red Team", host_chain_id, player_name)
    }
    
    /// Report round result (host only)
    /// result: BLUE_WIN, RED_WIN, or DRAW
    async fn report_round_result(&self, result: RoundResult) -> String {
        self.runtime.schedule_operation(&hoverwars::Operation::ReportRoundResult { result });
        format!("Round result reported: {:?}", result)
    }
    
    /// Leave the current lobby
    async fn leave_lobby(&self) -> String {
        self.runtime.schedule_operation(&hoverwars::Operation::LeaveLobby);
        "Leave lobby request scheduled".to_string()
    }
}

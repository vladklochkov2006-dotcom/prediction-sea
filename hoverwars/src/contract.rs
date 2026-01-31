// Copyright (c) HoverWars
// SPDX-License-Identifier: Apache-2.0

#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;

use hoverwars::{Operation, HoverWarsAbi, Player, Team, MatchState, CrossChainMessage, HoverWarsEvent};
use linera_sdk::{
    linera_base_types::{WithContractAbi, StreamName, ChainId},
    views::{RootView, View},
    Contract, ContractRuntime,
};

use self::state::HoverWarsState;

linera_sdk::contract!(HoverWarsContract);

pub struct HoverWarsContract {
    state: HoverWarsState,
    runtime: ContractRuntime<Self>,
}

impl WithContractAbi for HoverWarsContract {
    type Abi = HoverWarsAbi;
}

impl HoverWarsContract {
    /// Subscribe to a player's chain for events
    fn subscribe_to_player(&mut self, player_chain_id: &str) {
        if let Some(room) = self.state.room.get() {
            if let Ok(player_chain) = player_chain_id.parse() {
                let app_id = self.runtime.application_id().forget_abi();
                let stream = StreamName::from(format!("game_events_{}", room.room_id));
                
                eprintln!("[SUBSCRIPTION] Subscribing to player chain {:?}", player_chain);
                self.runtime.subscribe_to_events(player_chain, app_id, stream);
                eprintln!("[SUBSCRIPTION] Subscribed to player events");
            }
        }
    }
}

impl Contract for HoverWarsContract {
    type Message = CrossChainMessage;
    type InstantiationArgument = ();
    type Parameters = ();
    type EventValue = HoverWarsEvent;

    async fn load(runtime: ContractRuntime<Self>) -> Self {
        let state = HoverWarsState::load(runtime.root_view_storage_context())
            .await
            .expect("Failed to load state");
        HoverWarsContract { state, runtime }
    }

    async fn instantiate(&mut self, _argument: ()) {
        self.state.room.set(None);
        self.state.subscribed_to_host.set(None);
        eprintln!("[INIT] HoverWars contract initialized on chain {:?}", self.runtime.chain_id());
    }

    async fn execute_operation(&mut self, operation: Operation) -> () {
        match operation {
            Operation::CreateLobby { host_name } => {
                let host_chain_id = self.runtime.chain_id().to_string();
                let timestamp = self.runtime.system_time().micros().to_string();
                
                let room = hoverwars::GameRoom::new(host_chain_id.clone(), host_name.clone(), timestamp);
                self.state.room.set(Some(room.clone()));
                
                // Host subscribes to self (will subscribe to opponent when they join)
                self.subscribe_to_player(&host_chain_id);
                
                eprintln!("[CREATE_LOBBY] Lobby created by host '{}' (Blue Team)", host_name);
            }

            Operation::JoinLobby { host_chain_id, player_name } => {
                eprintln!("[JOIN_LOBBY] Sending join request to host chain '{}' from player '{}'", host_chain_id, player_name);
                
                if let Ok(target_chain) = host_chain_id.parse() {
                    let message = CrossChainMessage::JoinRequest {
                        player_chain_id: self.runtime.chain_id(),
                        player_name,
                    };
                    
                    self.runtime.send_message(target_chain, message);
                    eprintln!("[JOIN_LOBBY] Join request sent to chain {}", host_chain_id);
                } else {
                    eprintln!("[JOIN_LOBBY] Invalid host_chain_id format: {}", host_chain_id);
                }
            }

            Operation::ReportRoundResult { result } => {
                if let Some(mut room) = self.state.room.get().clone() {
                    let current_chain = self.runtime.chain_id();
                    
                    // Allow ANY player in the room to report
                    let is_host = room.host_chain_id == current_chain.to_string();
                    let is_guest = room.red_player.as_ref().map_or(false, |p| p.chain_id == current_chain.to_string());
                    
                    if !is_host && !is_guest {
                         eprintln!("[REPORT_ROUND] ERROR: Caller is not a player in this room");
                         return;
                    }

                    if room.match_state != MatchState::InProgress {
                        eprintln!("[REPORT_ROUND] ERROR: Match is not in progress");
                        return;
                    }
                    
                    let timestamp = self.runtime.system_time().micros().to_string();
                    let round_number = room.current_round;
                    let match_ended = room.apply_round_result(result, timestamp.clone());
                    
                    let blue_score = room.get_blue_score();
                    let red_score = room.get_red_score();
                    
                    self.state.room.set(Some(room.clone()));
                    
                    // Emit round completed event
                    self.runtime.emit(
                        format!("game_events_{}", room.room_id).into(),
                        &HoverWarsEvent::RoundCompleted {
                            round_number,
                            result,
                            blue_score,
                            red_score,
                            timestamp: timestamp.clone(),
                        }
                    );
                    
                    eprintln!("[REPORT_ROUND] Round {} completed: {:?}. Blue: {}, Red: {}", 
                             round_number, result, blue_score, red_score);
                    
                    // Send notification to OPPONENT
                    // If Host reported -> send to Guest (Red)
                    // If Guest reported -> send to Host (Blue)
                    let target_chain_str = if is_host {
                         room.red_player.as_ref().map(|p| p.chain_id.clone())
                    } else {
                         Some(room.host_chain_id.clone())
                    };

                    if let Some(target_chain_id) = target_chain_str {
                        if let Ok(target_chain) = target_chain_id.parse::<ChainId>() {
                             if match_ended {
                                 let message = CrossChainMessage::MatchEndNotification {
                                     winner: room.winner,
                                     blue_score,
                                     red_score,
                                     timestamp: timestamp.clone(),
                                 };
                                 self.runtime.send_message(target_chain, message);
                                 
                                 // Emit match ended event
                                 self.runtime.emit(
                                     format!("game_events_{}", room.room_id).into(),
                                     &HoverWarsEvent::MatchEnded {
                                         winner: room.winner,
                                         blue_score,
                                         red_score,
                                         timestamp,
                                     }
                                 );
                                 eprintln!("[REPORT_ROUND] Match ended! Winner: {:?}", room.winner);
                             } else {
                                 let message = CrossChainMessage::RoundResultNotification {
                                     round_number,
                                     result,
                                     blue_score,
                                     red_score,
                                     timestamp,
                                 };
                                 self.runtime.send_message(target_chain, message);
                             }
                        }
                    }
                }
            }

            Operation::LeaveLobby => {
                if let Some(room) = self.state.room.get().clone() {
                    let current_chain = self.runtime.chain_id();
                    let timestamp = self.runtime.system_time().micros().to_string();
                    
                    if room.host_chain_id == current_chain.to_string() {
                        // Host leaving - delete room and notify opponent
                        eprintln!("[LEAVE_LOBBY] Host leaving, deleting room");
                        
                        if let Some(ref red_player) = room.red_player {
                            if let Ok(red_chain) = red_player.chain_id.parse::<ChainId>() {
                                let message = CrossChainMessage::RoomDeleted {
                                    timestamp: timestamp.clone(),
                                };
                                self.runtime.send_message(red_chain, message);
                                
                                // Unsubscribe from opponent
                                let app_id = self.runtime.application_id().forget_abi();
                                let stream = StreamName::from(format!("game_events_{}", room.room_id));
                                self.runtime.unsubscribe_from_events(red_chain, app_id, stream);
                            }
                        }
                        
                        // Clear room
                        self.state.room.set(None);
                        
                    } else {
                        // Guest leaving - notify host
                        eprintln!("[LEAVE_LOBBY] Guest leaving");
                        
                        if let Ok(host_chain) = room.host_chain_id.parse::<ChainId>() {
                            let message = CrossChainMessage::PlayerLeftNotification {
                                player_chain_id: current_chain.to_string(),
                                timestamp: timestamp.clone(),
                            };
                            self.runtime.send_message(host_chain, message);
                            
                            // Unsubscribe from host
                            let app_id = self.runtime.application_id().forget_abi();
                            let stream = StreamName::from(format!("game_events_{}", room.room_id));
                            self.runtime.unsubscribe_from_events(host_chain, app_id, stream);
                        }
                        
                        // Clear local state
                        self.state.room.set(None);
                        self.state.subscribed_to_host.set(None);
                    }
                }
            }
        }
    }

    async fn execute_message(&mut self, message: Self::Message) {
        match message {
            CrossChainMessage::JoinRequest { player_chain_id, player_name } => {
                eprintln!("[JOIN_REQUEST] Received join request from player '{}' on chain {:?}", player_name, player_chain_id);
                
                if let Some(mut room) = self.state.room.get().clone() {
                    if room.red_player.is_some() {
                        eprintln!("[JOIN_REQUEST] ERROR: Room already has opponent");
                        return;
                    }
                    
                    let timestamp = self.runtime.system_time().micros().to_string();
                    
                    // Add red player
                    room.add_red_player(player_chain_id.to_string(), player_name.clone());
                    self.state.room.set(Some(room.clone()));
                    
                    // Subscribe to opponent's chain
                    self.subscribe_to_player(&player_chain_id.to_string());
                    
                    // Send initial state to the new player
                    let sync_message = CrossChainMessage::InitialStateSync {
                        room_data: room.clone(),
                    };
                    self.runtime.send_message(player_chain_id, sync_message);
                    
                    // Emit player joined event
                    let new_player = room.red_player.clone().unwrap();
                    self.runtime.emit(
                        format!("game_events_{}", room.room_id).into(),
                        &HoverWarsEvent::PlayerJoined {
                            player: new_player,
                            timestamp: timestamp.clone(),
                        }
                    );
                    
                    // Emit match started event
                    self.runtime.emit(
                        format!("game_events_{}", room.room_id).into(),
                        &HoverWarsEvent::MatchStarted {
                            blue_player_name: room.blue_player.name.clone(),
                            red_player_name: player_name.clone(),
                            timestamp,
                        }
                    );
                    
                    eprintln!("[JOIN_REQUEST] Player '{}' joined as Red Team. Match started!", player_name);
                }
            }

            CrossChainMessage::InitialStateSync { room_data } => {
                eprintln!("[INITIAL_STATE_SYNC] Received initial room state from host");
                
                let host_chain_id = room_data.host_chain_id.clone();
                let already_subscribed = self.state.subscribed_to_host.get()
                    .as_ref()
                    .map(|h| h == &host_chain_id)
                    .unwrap_or(false);
                
                if !already_subscribed {
                    if let Ok(host_chain) = host_chain_id.parse() {
                        let app_id = self.runtime.application_id().forget_abi();
                        let stream = StreamName::from(format!("game_events_{}", room_data.room_id));
                        self.runtime.subscribe_to_events(host_chain, app_id, stream);
                        
                        self.state.subscribed_to_host.set(Some(host_chain_id));
                        eprintln!("[INITIAL_STATE_SYNC] Subscribed to host game_events stream");
                    }
                }
                
                self.state.room.set(Some(room_data));
                eprintln!("[INITIAL_STATE_SYNC] Player now has complete room state");
            }

            CrossChainMessage::RoundResultNotification { round_number, result, blue_score, red_score, timestamp } => {
                eprintln!("[ROUND_RESULT] Received round {} result: {:?}", round_number, result);
                
                if let Some(mut room) = self.state.room.get().clone() {
                    // Update local scores
                    room.blue_player.score = blue_score;
                    if let Some(ref mut red) = room.red_player {
                        red.score = red_score;
                    }
                    room.current_round = round_number + 1;
                    
                    room.round_history.push(hoverwars::RoundHistoryEntry {
                        round_number,
                        result,
                        blue_score_after: blue_score,
                        red_score_after: red_score,
                        timestamp,
                    });
                    
                    self.state.room.set(Some(room));
                    eprintln!("[ROUND_RESULT] Local state updated. Blue: {}, Red: {}", blue_score, red_score);
                }
            }

            CrossChainMessage::MatchEndNotification { winner, blue_score, red_score, timestamp } => {
                eprintln!("[MATCH_END] Received match end notification. Winner: {:?}", winner);
                
                if let Some(mut room) = self.state.room.get().clone() {
                    room.blue_player.score = blue_score;
                    if let Some(ref mut red) = room.red_player {
                        red.score = red_score;
                    }
                    room.winner = winner;
                    room.match_state = MatchState::Finished;
                    
                    self.state.room.set(Some(room));
                    eprintln!("[MATCH_END] Match finished. Winner: {:?}", winner);
                }
            }

            CrossChainMessage::RoomDeleted { timestamp } => {
                eprintln!("[ROOM_DELETED] Received room deletion message at {}", timestamp);
                
                if let Some(room) = self.state.room.get().clone() {
                    if let Ok(host_chain) = room.host_chain_id.parse() {
                        let app_id = self.runtime.application_id().forget_abi();
                        let stream = StreamName::from(format!("game_events_{}", room.room_id));
                        self.runtime.unsubscribe_from_events(host_chain, app_id, stream);
                    }
                }
                
                self.state.room.set(None);
                self.state.subscribed_to_host.set(None);
                eprintln!("[ROOM_DELETED] Local state cleared");
            }

            CrossChainMessage::PlayerLeftNotification { player_chain_id, timestamp } => {
                eprintln!("[PLAYER_LEFT] Player {:?} left at {}", player_chain_id, timestamp);
                
                if let Some(mut room) = self.state.room.get().clone() {
                    // Unsubscribe from leaving player
                    if let Ok(player_chain) = player_chain_id.parse::<ChainId>() {
                        let app_id = self.runtime.application_id().forget_abi();
                        let stream = StreamName::from(format!("game_events_{}", room.room_id));
                        self.runtime.unsubscribe_from_events(player_chain, app_id, stream);
                    }
                    
                    // Remove red player and reset to waiting
                    room.red_player = None;
                    room.match_state = MatchState::WaitingForOpponent;
                    room.current_round = 0;
                    
                    // Emit player left event
                    self.runtime.emit(
                        format!("game_events_{}", room.room_id).into(),
                        &HoverWarsEvent::PlayerLeft {
                            player_chain_id: player_chain_id.clone(),
                            timestamp,
                        }
                    );
                    
                    self.state.room.set(Some(room));
                    eprintln!("[PLAYER_LEFT] Room reset to waiting for opponent");
                }
            }
        }
    }

    async fn store(mut self) {
        self.state.save().await.expect("Failed to save state");
    }
}

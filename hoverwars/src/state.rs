use linera_sdk::views::{linera_views, RegisterView, RootView, ViewStorageContext};
use hoverwars::GameRoom;

/// The application state for HoverWars Game
#[derive(RootView)]
#[view(context = ViewStorageContext)]
pub struct HoverWarsState {
    /// Game room data
    pub room: RegisterView<Option<GameRoom>>,
    /// Host chain ID that player is subscribed to (to prevent duplicate subscriptions)
    pub subscribed_to_host: RegisterView<Option<String>>,
}

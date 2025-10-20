use crate::jsonrpc::JsonRpcLoop;
use anyhow::Result;
use tracing_subscriber::EnvFilter;

pub struct RpcApp {
    rpc_loop: JsonRpcLoop,
}

impl RpcApp {
    pub fn new() -> Result<Self> {
        install_tracing();

        Ok(Self {
            rpc_loop: JsonRpcLoop::new()?,
        })
    }

    pub fn run(&mut self) -> Result<()> {
        self.rpc_loop.run()
    }
}

fn install_tracing() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .try_init();
}

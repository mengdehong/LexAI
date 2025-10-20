use rpc_worker::manager::RpcApp;

fn main() {
    if let Err(err) = RpcApp::new().and_then(|mut app| app.run()) {
        eprintln!("rpc worker failed: {err:?}");
        std::process::exit(1);
    }
}

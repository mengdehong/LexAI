import ReactDOM from "react-dom/client";
import App from "./App";
import { AppStateProvider } from "./state/AppState";
import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <MantineProvider theme={{ primaryColor: "indigo", defaultRadius: "md" }}>
    <ModalsProvider>
      <Notifications position="top-right" />
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </ModalsProvider>
  </MantineProvider>,
);

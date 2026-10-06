import { MessageCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const asset = (path: string) => `${BASE}${path}`;

export function DiscordApp() {
  return (
    <div className="dsc-app">
      <img className="dsc-logo" src={asset("images/discord-invite.png")} alt="Vertex-OS" />

      <h1 className="dsc-title">
        YOU HAVE BEEN INVITED TO JOIN Vertex-OS 🎃
      </h1>

      <a className="dsc-accept" href="https://dsc.gg/vertex-os" target="_blank" rel="noopener noreferrer">
        <MessageCircle size={16} />
        Accept invitation
      </a>

      <div className="dsc-qr">
        <img src={asset("images/discord-qr.png")} alt="QR code for the Vertex-OS Discord invite" />
        <span>or scan to join</span>
      </div>
    </div>
  );
}
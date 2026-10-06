import { useCallback, useState } from "react";
import { ArrowUpRight, Check, QrCode, ShieldCheck, Users } from "lucide-react";

const BASE = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const asset = (path: string) => `${BASE}${path}`;

const INVITE_URL = "https://dsc.gg/vertex-os";

/** Opens the invite in a brand new tab without ever navigating this page. */
function openInvite() {
  try {
    const win = window.open(INVITE_URL, "_blank");
    if (win) {
      try {
        win.opener = null;
      } catch {
        /* read-only handle, fine */
      }
    }
  } catch {
    /* pop-up blocked — the address is on screen either way */
  }
}

export function DiscordApp() {
  const [accepted, setAccepted] = useState(false);

  const accept = useCallback(() => {
    setAccepted(true);
    openInvite();
  }, []);

  return (
    <div className="dsc-app">
      <div className="dsc-glow" aria-hidden="true" />

      <div className="dsc-card">
        <span className="dsc-brand">
          <img className="dsc-brand-mark" src={asset("images/discord-invite.png")} alt="" />
          <span className="dsc-brand-text">
            <strong>Vertex-OS</strong>
            <small>official invite</small>
          </span>
        </span>

        <h1 className="dsc-title">
          YOU HAVE BEEN INVITED TO JOIN Vertex-OS <span className="dsc-pumpkin">🎃</span>
        </h1>

        <p className="dsc-copy">
          You have been invited to join the Vertex-OS community. Scan the code or accept the invitation to get
          access to the server.
        </p>

        <div className="dsc-invite-art">
          <img src={asset("images/discord-invite.png")} alt="Vertex-OS Discord invitation" />
        </div>

        <div className="dsc-qr">
          <span className="dsc-qr-head">
            <QrCode size={13} /> scan to join
          </span>
          <span className="dsc-qr-frame">
            <img src={asset("images/discord-qr.png")} alt="QR code for the Vertex-OS Discord invite" />
          </span>
          <small className="dsc-qr-url">{INVITE_URL.replace("https://", "")}</small>
        </div>

        <button type="button" className={`dsc-accept${accepted ? " is-accepted" : ""}`} onClick={accept}>
          {accepted ? <Check size={15} /> : <Users size={15} />}
          <span>Accept invitation</span>
          <ArrowUpRight size={15} className="dsc-accept-arrow" />
        </button>

        <span className="dsc-note">
          <ShieldCheck size={12} /> Opens dsc.gg/vertex-os in a new tab
        </span>
      </div>
    </div>
  );
}
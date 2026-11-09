// Outlook-style mail over world.data.mail. Links and attachments never leave the iframe.
import React, { useEffect, useMemo, useState } from "react";
import { emit, fileIconSrc, fmtSize, fmtTime, getNode, isInstalled, mailIn, newId, openNode, sceneChoice, senderEmail, senderName, shownName, unreadIn, useWorld } from "../../../../ocean/world-helpers";
import { Avatar, Btn, Empty, Fa, NavItem, OceanApp, useContextMenu, useNotice } from "./ui";
import "./mail.scss";

const FOLDER_META = {
  inbox: ["Inbox", "faInbox"],
  drafts: ["Drafts", "faFileLines"],
  sent: ["Sent Items", "faPaperPlane"],
  junk: ["Junk Email", "faBan"],
  trash: ["Deleted Items", "faTrashCan"],
  archive: ["Archive", "faBoxArchive"],
};
const folderLabel = (f) => (FOLDER_META[f] || [f.charAt(0).toUpperCase() + f.slice(1)])[0];
const folderIcon = (f) => (FOLDER_META[f] || [null, "faFolder"])[1];

// Mail ops accepted by the parent model: mark-read, flag, move, save-draft.
const mailOp = (op, item) => emit({ kind: "data", store: "mail", op, item });
const markRead = (id, read) => mailOp("mark-read", { id, read });
const setFlag = (id, flagged) => mailOp("flag", { id, flagged });
const moveTo = (id, folder) => mailOp("move", { id, folder });

// message.link is "scene:<id>": it opens the scene page in the browser. Anything else is a no-op.
const followLink = (world, msg, notice) => {
  if (!/^scene:[a-z0-9-]{1,40}$/.test(msg.link || "")) return notice("Links are disabled on this training desktop.");
  sceneChoice(world, "mail", msg.id, "follow-link");
  if (isInstalled(world, "browser")) emit({ kind: "open-app", app: "browser", payload: { url: msg.link } });
};
const trashMail = (world, msg) => {
  sceneChoice(world, "mail", msg.id, "delete");
  moveTo(msg.id, "trash");
};
const reportMail = (world, msg, notice) => {
  sceneChoice(world, "mail", msg.id, "report");
  if (world.data.mail.folders.includes("junk") && msg.folder !== "junk") moveTo(msg.id, "junk");
  notice("Reported to the IT security team. Thank you.");
};

const Compose = ({ world, draft, onClose }) => {
  const [to, setTo] = useState(draft.to || "");
  const [subject, setSubject] = useState(draft.subject || "");
  const [body, setBody] = useState(draft.body || "");
  // Only reserved fictional domains are accepted (the parent rejects anything else).
  const fictional = [...`${to} ${body}`.matchAll(/@([A-Za-z0-9.-]+)/g)].every((m) => /\.(example|invalid)$/i.test(m[1]));
  // Sending never leaves the iframe: the draft is saved, then filed under Sent.
  const save = (folder) => {
    mailOp("save-draft", { id: draft.id, to: to.trim(), subject: subject.trim() || "(no subject)", body });
    if (folder === "sent" && world.data.mail.folders.includes("sent")) moveTo(draft.id, "sent");
    onClose(folder);
  };
  return (
    <div className="ml-compose oc-col oc-grow">
      <div className="oc-toolbar">
        <Btn primary icon="faPaperPlane" onClick={() => save("sent")} disabled={!to.trim() || !fictional}>
          Send
        </Btn>
        <Btn subtle icon="faFloppyDisk" reg onClick={() => save("drafts")} disabled={!fictional}>
          Save draft
        </Btn>
        {!fictional ? <span className="oc-badge warn">Use .example addresses only</span> : null}
        <div className="oc-grow" />
        <Btn subtle icon="faTrashCan" reg onClick={() => onClose(null)} title="Discard" />
      </div>
      <div className="ml-compose-fields">
        <label className="ml-field">
          <span>To</span>
          <input className="ml-field-input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@northwind.example" />
        </label>
        <label className="ml-field">
          <span>Subject</span>
          <input className="ml-field-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Add a subject" />
        </label>
      </div>
      <textarea className="ml-compose-body oc-grow" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your message here. Mail stays on this training desktop." />
    </div>
  );
};

const Reader = ({ world, msg, onReply, onNotice }) => {
  const attachments = (msg.attachments || []).map((id) => getNode(world, id));
  const page = msg.link && ((world.data.web || {}).pages || {})[msg.link.replace(/^scene:/, "")];
  const linkText = msg.link && ((page && page.url) || msg.link.replace(/^scene:/, ""));
  return (
    <div className="ml-reader oc-col oc-grow">
      <div className="oc-toolbar">
        <Btn subtle icon="faReply" onClick={() => onReply(msg)}>
          Reply
        </Btn>
        <Btn subtle icon="faFlag" reg={!msg.flagged} onClick={() => setFlag(msg.id, !msg.flagged)}>
          {msg.flagged ? "Unflag" : "Flag"}
        </Btn>
        <Btn subtle icon={msg.read ? "faEnvelope" : "faEnvelopeOpen"} reg onClick={() => markRead(msg.id, !msg.read)}>
          {msg.read ? "Mark unread" : "Mark read"}
        </Btn>
        <select className="ml-move" value="" onChange={(e) => e.target.value && moveTo(msg.id, e.target.value)} title="Move to">
          <option value="">Move to…</option>
          {world.data.mail.folders
            .filter((f) => f !== msg.folder)
            .map((f) => (
              <option key={f} value={f}>
                {folderLabel(f)}
              </option>
            ))}
        </select>
        <div className="oc-grow" />
        <Btn subtle icon="faShieldHalved" onClick={() => reportMail(world, msg, onNotice)} title="Report phishing">
          Report
        </Btn>
        {msg.folder !== "trash" && world.data.mail.folders.includes("trash") ? (
          <Btn subtle icon="faTrashCan" reg onClick={() => trashMail(world, msg)}>
            Delete
          </Btn>
        ) : null}
      </div>
      <div className="ml-reader-body oc-scroll oc-grow">
        <div className="ml-subject">{msg.subject}</div>
        <div className="oc-row ml-from">
          <Avatar name={senderName(msg.from)} size={40} />
          <div className="oc-col oc-grow">
            <div className="oc-row">
              <span className="oc-h3">{senderName(msg.from)}</span>
              <span className="oc-faint oc-ellipsis">&lt;{senderEmail(msg.from)}&gt;</span>
            </div>
            <div className="oc-faint oc-ellipsis">To: {msg.to}</div>
          </div>
          <div className="oc-faint">{fmtTime(msg.time, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
        </div>
        {attachments.length ? (
          <div className="ml-attachments">
            {attachments.map((n, i) =>
              n && !n.trashed ? (
                <div key={n.id} className="ml-attach" data-attachment={n.id} data-ocean-key={"file:" + n.id} data-ocean-label={"The attachment “" + n.name + "”"} onClick={() => (sceneChoice(world, "mail", msg.id, "download"), openNode(world, n) || onNotice("No installed app can open this file."))} title={shownName(n, world)}>
                  <img src={fileIconSrc(n)} width={32} height={32} alt="" className="ml-attach-icon" />
                  <div className="oc-col">
                    <span className="oc-ellipsis">{shownName(n, world)}</span>
                    <span className="oc-faint">{fmtSize(n.size)}</span>
                  </div>
                </div>
              ) : (
                <div key={i} className="ml-attach" data-missing="true">
                  <Fa i="faFileCircleXmark" className="ml-attach-icon" />
                  <span>Attachment unavailable</span>
                </div>
              ),
            )}
          </div>
        ) : null}
        <div className="ml-text">{msg.body}</div>
        {msg.link ? (
          <div className="ml-link" data-ocean-key={"link:" + msg.id} data-ocean-label={"The link in “" + msg.subject + "”"} onClick={() => followLink(world, msg, onNotice)}>
            <Fa i="faLink" /> {linkText}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const MailApp = ({ win }) => {
  const world = useWorld();
  const mail = world.data.mail;
  const [folder, setFolder] = useState("inbox");
  const [selected, setSelected] = useState(null);
  const [compose, setCompose] = useState(null);
  const [query, setQuery] = useState("");
  const [openMenu, menu] = useContextMenu();
  const [notice, noticeNode] = useNotice();
  const payloadKey = win && win.payload && win.payload.messageId;

  useEffect(() => {
    const m = payloadKey && mail.messages.find((x) => x.id === payloadKey);
    if (m) {
      setFolder(m.folder);
      setSelected(m.id);
      setCompose(null);
      if (!m.read) markRead(m.id, true);
    }
  }, [payloadKey]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mailIn(world, folder).filter((m) => !q || `${m.from} ${m.subject} ${m.body}`.toLowerCase().includes(q));
  }, [world, folder, query]);
  const msg = mail.messages.find((m) => m.id === selected && m.folder === folder);

  const select = (m) => {
    if (m.folder === "drafts") {
      setCompose({ ...m });
      setSelected(m.id);
      return;
    }
    setCompose(null);
    setSelected(m.id);
    if (!m.read) markRead(m.id, true);
  };

  const itemMenu = (e, m) =>
    openMenu(e, [
      { label: m.read ? "Mark as unread" : "Mark as read", icon: "faEnvelope", onClick: () => markRead(m.id, !m.read) },
      { label: m.flagged ? "Clear flag" : "Flag", icon: "faFlag", onClick: () => setFlag(m.id, !m.flagged) },
      { sep: true },
      ...mail.folders.filter((f) => f !== m.folder && f !== "drafts").map((f) => ({ label: `Move to ${folderLabel(f)}`, icon: folderIcon(f), onClick: () => moveTo(m.id, f) })),
      { sep: true },
      { label: "Report phishing", icon: "faShieldHalved", onClick: () => reportMail(world, m, notice) },
      { label: "Delete", icon: "faTrashCan", onClick: () => trashMail(world, m), disabled: m.folder === "trash" || !mail.folders.includes("trash") },
    ]);

  const reply = (m) =>
    setCompose({
      id: newId("m"),
      to: senderEmail(m.from),
      subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`,
      body: `\n\n---\nFrom: ${m.from}\n${m.body}`,
    });

  const onDropFolder = (f) => (e) => {
    const id = e.dataTransfer.getData("text/x-ocean-mail");
    if (id && f !== "drafts") moveTo(id, f);
  };

  return (
    <OceanApp className="ml-app">
      <div className="oc-sidebar ml-folders">
        <Btn primary icon="faPenToSquare" reg className="ml-new" onClick={() => setCompose({ id: newId("m") })}>
          New mail
        </Btn>
        <div className="oc-sidebar-title ml-account oc-ellipsis" title={world.user.email}>
          {world.user.email}
        </div>
        {mail.folders.map((f) => (
          <NavItem
            key={f}
            icon={folderIcon(f)}
            label={folderLabel(f)}
            count={f === "drafts" ? mailIn(world, f).length : unreadIn(world, f)}
            active={folder === f}
            onClick={() => {
              setFolder(f);
              setSelected(null);
              setCompose(null);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropFolder(f)}
          />
        ))}
      </div>
      <div className="ml-list oc-col">
        <div className="ml-list-head">
          <div className="oc-h2">{folderLabel(folder)}</div>
          <div className="oc-search">
            <Fa i="faMagnifyingGlass" />
            <input className="oc-input" placeholder="Search mail" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="oc-scroll oc-grow">
          {list.length === 0 ? (
            <Empty icon="faInbox" title={query ? "No results" : "All caught up"}>
              {query ? "Try a different search." : "Nothing in this folder."}
            </Empty>
          ) : (
            list.map((m) => (
              <div
                key={m.id}
                className="oc-list-item ml-item"
                data-ocean-key={"mail:" + m.id}
                data-ocean-label={"The email “" + m.subject + "”"}
                data-active={m.id === selected}
                data-unread={!m.read}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/x-ocean-mail", m.id)}
                onClick={() => select(m)}
                onContextMenu={(e) => itemMenu(e, m)}
              >
                <Avatar name={folder === "sent" || folder === "drafts" ? m.to : senderName(m.from)} size={32} />
                <div className="oc-col oc-grow">
                  <div className="oc-row">
                    <span className="ml-sender oc-ellipsis oc-grow">{folder === "sent" || folder === "drafts" ? m.to : senderName(m.from)}</span>
                    {m.flagged ? <Fa i="faFlag" className="ml-flag" /> : null}
                    {(m.attachments || []).length ? <Fa i="faPaperclip" className="oc-faint" /> : null}
                    <span className="oc-faint">{fmtTime(m.time, { month: "short", day: "numeric" })}</span>
                  </div>
                  <div className="ml-subj oc-ellipsis">{m.subject}</div>
                  <div className="oc-faint oc-ellipsis">{String(m.body).replace(/\s+/g, " ")}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {compose ? (
        <Compose key={compose.id} world={world} draft={compose} onClose={(f) => (setCompose(null), f && (setFolder(f), setSelected(compose.id)))} />
      ) : msg ? (
        <Reader world={world} msg={msg} onReply={reply} onNotice={notice} />
      ) : (
        <div className="ml-reader oc-col oc-grow">
          <Empty icon="faEnvelopeOpen" title="Select an item to read">
            Nothing is selected
          </Empty>
        </div>
      )}
      {menu}
      {noticeNode}
    </OceanApp>
  );
};

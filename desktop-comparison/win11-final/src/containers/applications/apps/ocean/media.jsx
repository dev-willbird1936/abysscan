// Media Player over the shared data.media store (macOS Music): library, playlists, liked songs, shuffle,
// repeat and now playing (queue, position true at `at`). Playback is simulated: no audio is decoded or
// fetched. Only the visible shell advances tracks. Library view and selection are local.
import React, { useEffect, useRef, useState } from "react";
import { emit, isMedia, newId, useWorld } from "../../../../ocean/world-helpers";
import { sinceAt, syncedOp, useSynced } from "../../../../ocean/synced";
import { coverFor } from "./art";
import { Btn, Empty, Fa, NavItem, OceanApp, useContextMenu, useNow } from "./ui";
import "./media.scss";

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const active = () => document.body.dataset.oceanActive !== "false";
const positionOf = (np, now) => (!np ? 0 : np.positionSec + (np.playing ? sinceAt(np.at, now) / 1000 : 0));
const pick = (t) => ({ id: t.id, title: t.title, artist: t.artist, album: t.album, genre: t.genre, asset: t.asset, ...(t.cover ? { cover: t.cover } : {}), duration: t.duration, loved: t.loved });

export const MediaApp = ({ win }) => {
  const world = useWorld();
  const media = useSynced("media");
  const { volume, muted } = world.sys;
  const [view, setView] = useState("songs");
  const [sel, setSel] = useState(null);
  const [naming, setNaming] = useState(null);
  const [seek, setSeek] = useState(null); // seconds while the seek bar is dragged
  const [openMenu, menu] = useContextMenu();
  const np = media.nowPlaying;
  const now = useNow(np && np.playing ? 500 : 100000);
  const track = np && media.tracks.find((t) => t.id === np.trackId);
  const pos = Math.min(positionOf(np, now), track ? track.duration : 0);
  const payloadFile = win && win.payload && win.payload.fileId;
  const ended = useRef(null);

  const playback = (patch) => {
    const base = np || { trackId: null, queue: [], positionSec: 0, playing: false };
    const next = { trackId: base.trackId, queue: base.queue, positionSec: Math.round(positionOf(np, Date.now()) * 10) / 10, playing: base.playing, ...patch };
    syncedOp("media", "set-playback", next.trackId ? next : { trackId: null, queue: [], positionSec: 0, playing: false });
  };
  const playList = (ids, start) => {
    if (!ids.length) return;
    let queue = [...ids];
    if (media.shuffle) queue = [start, ...queue.filter((id) => id !== start).sort(() => Math.random() - 0.5)];
    playback({ trackId: start, queue, positionSec: 0, playing: true });
  };
  const step = (d) => {
    if (!np || !np.queue.length) return;
    if (d < 0 && pos > 3) return playback({ positionSec: 0 });
    let i = np.queue.indexOf(np.trackId) + d;
    if (i >= np.queue.length) {
      if (media.repeat !== "all") return playback({ positionSec: 0, playing: false });
      i = 0;
    }
    playback({ trackId: np.queue[Math.max(0, i)], positionSec: 0 });
  };
  const toggle = () => (np ? playback({ playing: !np.playing }) : playList(media.tracks.map((t) => t.id), (media.tracks[0] || {}).id));

  // The visible shell moves on when a track ends (repeat one restarts it).
  useEffect(() => {
    if (!track || !np.playing || pos < track.duration || !active() || ended.current === np.at) return;
    ended.current = np.at;
    media.repeat === "one" ? playback({ positionSec: 0 }) : step(1);
  }, [pos]);

  // Opening a media file imports it as a track (as macOS Music does), then plays it.
  useEffect(() => {
    const n = payloadFile && world.fs.nodes[payloadFile];
    if (!n || !isMedia(n)) return;
    if (!media.tracks.some((t) => t.id === n.id))
      syncedOp("media", "track-upsert", { id: n.id, title: n.name.replace(/\.[^.]+$/, "").slice(0, 120), artist: "Unknown artist", album: "Imported", genre: "Imported", asset: n.id, duration: 180, loved: false });
    playback({ trackId: n.id, queue: [n.id], positionSec: 0, playing: true });
  }, [payloadFile]);

  const playlist = view.startsWith("pl:") && media.playlists.find((p) => p.id === view.slice(3));
  const list =
    view === "liked" ? media.tracks.filter((t) => t.loved)
      : view === "queue" ? (np ? np.queue.map((id) => media.tracks.find((t) => t.id === id)).filter(Boolean) : [])
      : playlist ? playlist.trackIds.map((id) => media.tracks.find((t) => t.id === id)).filter(Boolean)
      : [...media.tracks].sort((a, b) => (view === "artists" ? a.artist.localeCompare(b.artist) : view === "albums" ? a.album.localeCompare(b.album) : a.title.localeCompare(b.title)));
  const title = playlist ? playlist.name : { songs: "Music library", albums: "Albums", artists: "Artists", liked: "Liked songs", queue: "Play queue" }[view];

  const love = (t) => syncedOp("media", "track-upsert", pick({ ...t, loved: !t.loved }));
  const savePlaylist = (p) => syncedOp("media", "playlist-upsert", { id: p.id, name: p.name.slice(0, 80) || "Untitled playlist", trackIds: p.trackIds.slice(0, 200) });
  const rowMenu = (e, t) =>
    openMenu(e, [
      { label: "Play", icon: "faPlay", onClick: () => playList(list.map((x) => x.id), t.id) },
      { label: "Play next", icon: "faForward", disabled: !np, onClick: () => { const q = np.queue.filter((id) => id !== t.id); q.splice(q.indexOf(np.trackId) + 1, 0, t.id); playback({ queue: q }); } },
      { label: t.loved ? "Remove from liked" : "Like", icon: "faHeart", onClick: () => love(t) },
      { sep: true },
      ...media.playlists.filter((p) => !p.trackIds.includes(t.id)).map((p) => ({ label: `Add to ${p.name}`, icon: "faListUl", onClick: () => savePlaylist({ ...p, trackIds: [...p.trackIds, t.id] }) })),
      ...(playlist ? [{ label: "Remove from playlist", icon: "faTrashCan", onClick: () => savePlaylist({ ...playlist, trackIds: playlist.trackIds.filter((id) => id !== t.id) }) }] : []),
    ]);
  const newPlaylist = () => {
    const id = newId("pl");
    savePlaylist({ id, name: `Playlist ${media.playlists.length + 1}`, trackIds: [] });
    setView(`pl:${id}`);
    setNaming(id);
  };

  return (
    <OceanApp className="md-app">
      <div className="oc-col oc-grow">
        <div className="oc-row oc-grow md-body">
          <div className="oc-sidebar md-side">
            <NavItem icon="faMusic" label="Music library" active={view === "songs"} onClick={() => setView("songs")} />
            <NavItem icon="faCompactDisc" label="Albums" active={view === "albums"} onClick={() => setView("albums")} />
            <NavItem icon="faUser" reg label="Artists" active={view === "artists"} onClick={() => setView("artists")} />
            <NavItem icon="faHeart" reg label="Liked songs" count={media.tracks.filter((t) => t.loved).length} active={view === "liked"} onClick={() => setView("liked")} />
            <NavItem icon="faListOl" label="Play queue" active={view === "queue"} onClick={() => setView("queue")} />
            <div className="oc-sidebar-title oc-row">
              <span className="oc-grow">Playlists</span>
              <button type="button" className="md-ib md-add" title="New playlist" onClick={newPlaylist}>
                <Fa i="faPlus" />
              </button>
            </div>
            {media.playlists.map((p) => (
              <NavItem key={p.id} icon="faListUl" label={p.name} count={p.trackIds.length} active={view === `pl:${p.id}`} onClick={() => setView(`pl:${p.id}`)} />
            ))}
          </div>
          <div className="oc-col oc-grow md-lib">
            <div className="oc-row md-title">
              {playlist && naming === playlist.id ? (
                <input className="oc-input oc-h1" autoFocus defaultValue={playlist.name} onBlur={(e) => (setNaming(null), savePlaylist({ ...playlist, name: e.target.value.trim() }))} onKeyDown={(e) => e.key === "Enter" && e.target.blur()} />
              ) : (
                <div className="oc-h1 oc-grow" onDoubleClick={() => playlist && setNaming(playlist.id)}>{title}</div>
              )}
              {playlist ? <Btn subtle icon="faTrashCan" reg title="Delete playlist" onClick={() => (syncedOp("media", "playlist-delete", { id: playlist.id }), setView("songs"))} /> : null}
              <Btn primary icon="faShuffle" disabled={!list.length} onClick={() => (syncedOp("media", "set-mode", { shuffle: true, repeat: media.repeat }), playList(list.map((t) => t.id), list[Math.floor(Math.random() * list.length)].id))}>
                Shuffle and play
              </Btn>
            </div>
            <div className="oc-faint md-sub">{list.length} songs · playback is simulated on this training desktop</div>
            {list.length ? (
              <div className="oc-scroll oc-grow" data-testid="media-list">
                <div className="md-row md-head">
                  <span />
                  <span>Title</span>
                  <span>Artist</span>
                  <span>Album</span>
                  <span />
                  <span>Length</span>
                </div>
                {list.map((t, i) => (
                  <div key={t.id + i} className="md-row" data-active={track && t.id === track.id} data-sel={t.id === sel} onClick={() => setSel(t.id)} onDoubleClick={() => playList(list.map((x) => x.id), t.id)} onContextMenu={(e) => rowMenu(e, t)}>
                    <span className="md-idx">{track && t.id === track.id && np.playing ? <Fa i="faVolumeHigh" /> : i + 1}</span>
                    <span className="oc-row">
                      <img src={coverFor(t.cover || t.asset)} alt="" className="md-thumb" />
                      <span className="oc-ellipsis">{t.title}</span>
                    </span>
                    <span className="oc-faint oc-ellipsis">{t.artist}</span>
                    <span className="oc-faint oc-ellipsis">{t.album}</span>
                    <button type="button" className="md-ib md-love" data-on={t.loved} title={t.loved ? "Remove from liked" : "Like"} onClick={(e) => (e.stopPropagation(), love(t))}>
                      <Fa i="faHeart" reg={!t.loved} />
                    </button>
                    <span className="oc-faint">{clock(t.duration)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty icon="faMusic" title={view === "queue" ? "Nothing in the queue" : "Nothing here yet"}>
                {view === "queue" ? "Play a song to start the queue." : playlist ? "Right-click a song to add it to this playlist." : "Songs in your library appear here."}
              </Empty>
            )}
          </div>
        </div>
        <div className="md-player">
          <div className="oc-row md-now">
            {track ? <img src={coverFor(track.cover || track.asset)} alt="" className="md-cover" /> : <div className="md-cover md-cover-empty"><Fa i="faMusic" /></div>}
            <div className="oc-col" style={{ minWidth: 0 }}>
              <span className="oc-h3 oc-ellipsis" data-testid="media-now">{track ? track.title : "Nothing playing"}</span>
              <span className="oc-faint oc-ellipsis">{track ? track.artist : "Pick a song"}</span>
            </div>
          </div>
          <div className="oc-col md-ctrl">
            <div className="oc-row md-buttons">
              <button type="button" className="md-ib" data-on={media.shuffle} onClick={() => syncedOp("media", "set-mode", { shuffle: !media.shuffle, repeat: media.repeat })} title="Shuffle">
                <Fa i="faShuffle" />
              </button>
              <button type="button" className="md-ib" onClick={() => step(-1)} title="Previous" disabled={!np}>
                <Fa i="faBackwardStep" />
              </button>
              <button type="button" className="md-play" onClick={toggle} title={np && np.playing ? "Pause" : "Play"} data-testid="media-play">
                <Fa i={np && np.playing ? "faPause" : "faPlay"} />
              </button>
              <button type="button" className="md-ib" onClick={() => step(1)} title="Next" disabled={!np}>
                <Fa i="faForwardStep" />
              </button>
              <button type="button" className="md-ib md-repeat" data-on={media.repeat !== "off"} onClick={() => syncedOp("media", "set-mode", { shuffle: media.shuffle, repeat: { off: "all", all: "one", one: "off" }[media.repeat] })} title={`Repeat: ${media.repeat}`}>
                <Fa i="faRepeat" />
                {media.repeat === "one" ? <span className="md-one">1</span> : null}
              </button>
            </div>
            <div className="oc-row md-seek">
              <span className="oc-faint">{clock(seek != null ? seek : pos)}</span>
              <input type="range" min={0} max={track ? track.duration : 1} value={seek != null ? seek : pos} onChange={(e) => setSeek(+e.target.value)} onMouseUp={(e) => (playback({ positionSec: +e.target.value }), setSeek(null))} disabled={!track} className="md-range oc-grow" />
              <span className="oc-faint">{clock(track ? track.duration : 0)}</span>
            </div>
          </div>
          <div className="oc-row md-vol">
            <button type="button" className="md-ib" onClick={() => emit({ kind: "set-sys", patch: { muted: !muted } })} title={muted ? "Unmute" : "Mute"}>
              <Fa i={muted || volume === 0 ? "faVolumeXmark" : volume < 50 ? "faVolumeLow" : "faVolumeHigh"} />
            </button>
            <input
              type="range"
              min={0}
              max={100}
              defaultValue={volume}
              key={volume}
              onMouseUp={(e) => emit({ kind: "set-sys", patch: { volume: +e.target.value, muted: false } })}
              onKeyUp={(e) => emit({ kind: "set-sys", patch: { volume: +e.target.value, muted: false } })}
              className="md-range"
              title={`Volume ${volume}`}
            />
          </div>
        </div>
      </div>
      {menu}
    </OceanApp>
  );
};

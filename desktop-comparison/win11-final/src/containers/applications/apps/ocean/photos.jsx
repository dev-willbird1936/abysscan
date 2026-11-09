// Photos over the shared data.photos store (macOS Photos): library by month, favourites, albums and
// Recently deleted (trashed). Opening an image file from File Explorer shows that file in the viewer.
// Images are local placeholder art keyed by asset id; view, zoom and selection are local.
import React, { useEffect, useState } from "react";
import { emit, fileAsset, fmtSize, fmtTime, isImage, newId, useWorld, winPath } from "../../../../ocean/world-helpers";
import { syncedOp, useSynced } from "../../../../ocean/synced";
import { artFor } from "./art";
import { Btn, Empty, Fa, NavItem, OceanApp, useContextMenu } from "./ui";
import "./media.scss";

// asset: a data:image URL, a same-origin img/ path, or a name for generated placeholder art.
const assetSrc = (a) => (/^data:image\//.test(a) || /^img\//.test(a) ? a : artFor(a));
export const imageSrc = (world, node) => assetSrc(fileAsset(world, node) || node.id);

const pick = (p) => ({ id: p.id, name: p.name, asset: p.asset, taken: p.taken, favorite: p.favorite, trashed: p.trashed });
const month = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });

// Full-window viewer for a list of {id, name, src, sub, photo?}.
const Viewer = ({ list, start, onClose, actions }) => {
  const [id, setId] = useState(start);
  const [zoom, setZoom] = useState(1);
  const [info, setInfo] = useState(false);
  const cur = list.find((p) => p.id === id) || list[0];
  useEffect(() => {
    if (!cur) onClose();
  }, [cur]);
  if (!cur) return null;
  const idx = list.indexOf(cur);
  const go = (d) => (setId(list[(idx + d + list.length) % list.length].id), setZoom(1));
  return (
    <div className="ph-viewer oc-row oc-grow" tabIndex={-1} onKeyDown={(e) => (e.key === "ArrowRight" ? go(1) : e.key === "ArrowLeft" ? go(-1) : e.key === "Escape" ? onClose() : null)}>
      <div className="oc-col oc-grow">
        <div className="oc-toolbar ph-bar">
          <Btn subtle icon="faArrowLeft" onClick={onClose} title="Back" />
          <span className="oc-ellipsis">{cur.name}</span>
          <div className="oc-grow" />
          <Btn subtle icon="faMagnifyingGlassMinus" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} title="Zoom out" />
          <span className="oc-faint">{Math.round(zoom * 100)}%</span>
          <Btn subtle icon="faMagnifyingGlassPlus" onClick={() => setZoom(Math.min(3, zoom + 0.25))} title="Zoom in" />
          <div className="oc-toolbar-sep" />
          {actions(cur)}
          <Btn subtle icon="faCircleInfo" onClick={() => setInfo(!info)} title="File information" />
        </div>
        <div className="ph-stage oc-grow">
          <img src={cur.src} alt={cur.name} style={{ transform: `scale(${zoom})` }} draggable={false} />
          {list.length > 1 ? (
            <>
              <button type="button" className="ph-nav left" onClick={() => go(-1)} title="Previous">
                <Fa i="faChevronLeft" />
              </button>
              <button type="button" className="ph-nav right" onClick={() => go(1)} title="Next">
                <Fa i="faChevronRight" />
              </button>
            </>
          ) : null}
        </div>
        <div className="ph-strip">
          {list.map((p) => (
            <img key={p.id} src={p.src} alt="" data-active={p.id === cur.id} onClick={() => setId(p.id)} />
          ))}
        </div>
      </div>
      {info ? (
        <div className="ph-info">
          <div className="oc-h3">Info</div>
          <div className="oc-kv">
            {cur.facts.map(([k, v]) => (
              <React.Fragment key={k}>
                <span>{k}</span>
                <span>{v}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const PhotosApp = ({ win }) => {
  const world = useWorld();
  const { items, albums } = useSynced("photos");
  const [view, setView] = useState("all");
  const [open, setOpen] = useState(null); // photo id, or `file:<id>` for an fs image
  const [naming, setNaming] = useState(null);
  const [openMenu, menu] = useContextMenu();
  const payloadFile = win && win.payload && win.payload.fileId;
  useEffect(() => {
    if (payloadFile) setOpen(`file:${payloadFile}`);
  }, [payloadFile]);

  const save = (p, patch) => syncedOp("photos", "photo-upsert", pick({ ...p, ...patch }));
  const saveAlbum = (a) => syncedOp("photos", "album-upsert", { id: a.id, name: a.name.slice(0, 80) || "Untitled album", photoIds: a.photoIds });
  const live = items.filter((p) => !p.trashed);
  const album = view.startsWith("al:") && albums.find((a) => a.id === view.slice(3));
  const shown = (
    view === "favorites" ? live.filter((p) => p.favorite)
      : view === "deleted" ? items.filter((p) => p.trashed)
      : album ? album.photoIds.map((id) => live.find((p) => p.id === id)).filter(Boolean)
      : live
  ).sort((a, b) => (album ? 0 : a.taken < b.taken ? 1 : -1));
  const title = album ? album.name : { all: "All photos", favorites: "Favourites", deleted: "Recently deleted" }[view];

  const photoMenu = (e, p) =>
    openMenu(e, view === "deleted"
      ? [
          { label: "Restore", icon: "faRotateLeft", onClick: () => save(p, { trashed: false }) },
          { label: "Delete permanently", icon: "faTrashCan", onClick: () => syncedOp("photos", "photo-delete", { id: p.id }) },
        ]
      : [
          { label: "Open", icon: "faImage", onClick: () => setOpen(p.id) },
          { label: p.favorite ? "Remove from favourites" : "Add to favourites", icon: "faHeart", onClick: () => save(p, { favorite: !p.favorite }) },
          { sep: true },
          ...albums.filter((a) => !a.photoIds.includes(p.id)).map((a) => ({ label: `Add to ${a.name}`, icon: "faImages", onClick: () => saveAlbum({ ...a, photoIds: [...a.photoIds, p.id] }) })),
          ...(album ? [{ label: "Remove from album", icon: "faMinus", onClick: () => saveAlbum({ ...album, photoIds: album.photoIds.filter((id) => id !== p.id) }) }] : []),
          { label: "Delete", icon: "faTrashCan", onClick: () => save(p, { trashed: true, favorite: false }) },
        ]);
  const newAlbum = () => {
    const id = newId("al");
    saveAlbum({ id, name: `Album ${albums.length + 1}`, photoIds: [] });
    setView(`al:${id}`);
    setNaming(id);
  };

  if (open) {
    const file = open.startsWith("file:") && world.fs.nodes[open.slice(5)];
    const list = file
      ? [{ id: file.id, name: file.name, src: imageSrc(world, file), facts: [["Name", file.name], ["Modified", fmtTime(file.modified)], ["Size", fmtSize(file.size)], ["Location", winPath(world, file.parentId)]], node: file }]
      : shown.map((p) => ({ id: p.id, name: p.name, src: assetSrc(p.asset), photo: p, facts: [["Name", p.name], ["Taken", fmtTime(p.taken, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })], ["Favourite", p.favorite ? "Yes" : "No"]] }));
    return (
      <OceanApp className="ph-app">
        <Viewer
          list={list}
          start={file ? file.id : open}
          onClose={() => setOpen(null)}
          actions={(cur) =>
            cur.photo ? (
              <>
                <Btn subtle icon="faHeart" reg={!cur.photo.favorite} onClick={() => save(cur.photo, { favorite: !cur.photo.favorite })} title="Favourite" />
                <Btn subtle icon="faTrashCan" reg onClick={() => save(cur.photo, { trashed: true, favorite: false })} title="Delete" />
              </>
            ) : cur.node && isImage(cur.node) ? (
              <Btn subtle icon="faTrashCan" reg onClick={() => (emit({ kind: "fs", op: "trash", id: cur.node.id }), setOpen(null))} title="Delete" />
            ) : null
          }
        />
      </OceanApp>
    );
  }

  const groups = [];
  for (const p of shown) {
    const key = album || view === "deleted" ? title : month(p.taken);
    if (!groups.length || groups[groups.length - 1][0] !== key) groups.push([key, []]);
    groups[groups.length - 1][1].push(p);
  }
  return (
    <OceanApp className="ph-app">
      <div className="oc-sidebar">
        <NavItem icon="faImages" reg label="All photos" count={live.length} active={view === "all"} onClick={() => setView("all")} />
        <NavItem icon="faHeart" reg label="Favourites" count={live.filter((p) => p.favorite).length} active={view === "favorites"} onClick={() => setView("favorites")} />
        <div className="oc-sidebar-title oc-row">
          <span className="oc-grow">Albums</span>
          <Btn subtle icon="faPlus" title="New album" onClick={newAlbum} />
        </div>
        {albums.map((a) => (
          <NavItem key={a.id} icon="faFolder" reg label={a.name} count={a.photoIds.length} active={view === `al:${a.id}`} onClick={() => setView(`al:${a.id}`)} />
        ))}
        <div className="oc-grow" />
        <NavItem icon="faTrashCan" reg label="Recently deleted" count={items.filter((p) => p.trashed).length} active={view === "deleted"} onClick={() => setView("deleted")} />
      </div>
      <div className="oc-col oc-grow ph-gallery">
        <div className="oc-row ph-title">
          {album && naming === album.id ? (
            <input className="oc-input oc-h1 oc-grow" autoFocus defaultValue={album.name} onBlur={(e) => (setNaming(null), saveAlbum({ ...album, name: e.target.value.trim() }))} onKeyDown={(e) => e.key === "Enter" && e.target.blur()} />
          ) : (
            <div className="oc-h1 oc-grow" onDoubleClick={() => album && setNaming(album.id)}>{title}</div>
          )}
          {album ? <Btn subtle icon="faTrashCan" reg title="Delete album" onClick={() => (syncedOp("photos", "album-delete", { id: album.id }), setView("all"))} /> : null}
        </div>
        <div className="oc-faint ph-sub">{shown.length} items{view === "deleted" ? " · right-click to restore or delete permanently" : ""}</div>
        {shown.length ? (
          <div className="oc-scroll oc-grow" data-testid="photos-grid">
            {groups.map(([key, list]) => (
              <React.Fragment key={key}>
                {!album && view !== "deleted" ? <div className="oc-h3 ph-month">{key}</div> : null}
                <div className="ph-grid">
                  {list.map((p) => (
                    <div key={p.id} className="ph-tile" onClick={() => view !== "deleted" && setOpen(p.id)} onContextMenu={(e) => photoMenu(e, p)} title={p.name}>
                      <img src={assetSrc(p.asset)} alt={p.name} draggable={false} />
                      {p.favorite ? <Fa i="faHeart" className="ph-fav" /> : null}
                      <span className="ph-tile-name oc-ellipsis">{p.name}</span>
                    </div>
                  ))}
                </div>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <Empty icon="faImage" title={view === "deleted" ? "Nothing deleted" : "No photos here"}>
            {album ? "Right-click a photo to add it to this album." : "Photos in your library appear here."}
          </Empty>
        )}
      </div>
      {menu}
    </OceanApp>
  );
};

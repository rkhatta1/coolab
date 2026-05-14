"use client"

import {
  AtSign,
  Bell,
  ChevronRight,
  Check,
  Circle,
  Clock3,
  Copy,
  Eye,
  Folder,
  GripVertical,
  Group,
  LogOut,
  MailPlus,
  Minus,
  MessageSquare,
  MousePointer2,
  Pencil,
  Plus,
  Send,
  Settings,
  Shield,
  Trash2,
  Ungroup,
  UserMinus,
  X,
} from "lucide-react"
import { SignOutButton, useUser } from "@clerk/nextjs"
import { useMutation, useQuery } from "convex/react"
import { Caveat } from "next/font/google"
import {
  FormEvent,
  PointerEvent,
  TouchEvent,
  WheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

const caveat = Caveat({ subsets: ["latin"], weight: ["700"] })

type Session = {
  _id: string
  title: string
  status: "draft" | "review" | "approved"
  accountId: string
  ownerUserId?: string
  updatedAt: number
  account?: { _id: string; name: string; handle: string; color: string } | null
}

type Account = {
  _id: string
  name: string
  handle: string
  color: string
}

type CanvasNode = {
  _id: string
  kind: "text" | "image" | "mixed" | "image-loading"
  x: number
  y: number
  width: number
  height: number
  heading?: string
  text?: string
  imageUrl?: string
  localImageUrl?: string
  updatedByUserId?: string
}

type CanvasGroup = {
  _id: string
  name: string
  nodeIds: string[]
  x: number
  y: number
  width: number
  height: number
}

type NodeBox = Pick<CanvasNode, "x" | "y" | "width" | "height">
type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

type Message = {
  _id: string
  userId: string
  body: string
  taggedNodeIds: string[]
  createdAt: number
}

type Presence = {
  _id: string
  userId: string
  name: string
  color: string
  avatarUrl?: string
  cursorX: number
  cursorY: number
  activeNodeId?: string
}

type InviteRole = "viewer" | "editor"
type MemberRole = "owner" | InviteRole

type Collaborator = {
  _id: string
  userId: string
  role: MemberRole
  joinedAt: number
  user?: {
    name: string
    email: string
    avatarUrl?: string
    color: string
  } | null
}

type SessionInvite = {
  _id: string
  sessionId: string
  invitedEmail: string
  invitedByUserId: string
  role: InviteRole
  status: "pending" | "accepted" | "declined"
  createdAt: number
  session?: Pick<Session, "_id" | "title"> | null
}

type UserNotification = {
  _id: string
  type: "invite" | "invite_declined"
  sessionId: string
  inviteId?: string
  message: string
  createdAt: number
  session?: Pick<Session, "_id" | "title"> | null
}

type SessionAccess = {
  collaborators: Collaborator[]
  invites: SessionInvite[]
}

type UserInbox = {
  invitations: SessionInvite[]
  notifications: UserNotification[]
}

type InviteDraft = {
  email: string
  role: InviteRole
}

const isConvexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)
function sessionId(id: string) {
  return id as Id<"sessions">
}

function accountId(id: string) {
  return id as Id<"accounts">
}

function nodeId(id: string) {
  return id as Id<"nodes">
}

function groupId(id: string) {
  return id as Id<"groups">
}

function inviteId(id: string) {
  return id as Id<"invites">
}

function collaboratorId(id: string) {
  return id as Id<"collaborators">
}

function notificationId(id: string) {
  return id as Id<"notifications">
}

function nodeHeading(node?: Pick<CanvasNode, "heading" | "text" | "kind">) {
  if (!node) return "Node"
  if (node.heading?.trim()) return node.heading.trim()
  const firstLine = node.text?.split("\n").find((line) => line.trim())
  if (firstLine) return firstLine.replace(/^#+\s*/, "").trim()
  return `${node.kind.charAt(0).toUpperCase()}${node.kind.slice(1)} node`
}

function groupHeading(group?: Pick<CanvasGroup, "name">) {
  return group?.name?.trim() || "Group"
}

const fallbackAccounts: Account[] = [
  {
    _id: "local-account-1",
    name: "Arc Studio",
    handle: "arc-studio",
    color: "#0f766e",
  },
]

function isProbablyUrl(value: string) {
  return /^https?:\/\//i.test(value.trim())
}

function renderInlineLinks(value: string) {
  const parts = value.split(/(https?:\/\/[^\s<>()]+)/gi)

  return parts.map((part, index) =>
    /^https?:\/\//i.test(part) ? (
      <a
        className="font-medium text-[#1d4ed8] underline decoration-[#9dbdff] underline-offset-2"
        href={part}
        key={`${part}-${index}`}
        onPointerDown={(event) => event.stopPropagation()}
        rel="noreferrer"
        target="_blank"
      >
        {part}
      </a>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  )
}

function renderMarkdown(value = "") {
  return value.split("\n").map((line, index) => {
    const trimmed = line.trim()

    if (!trimmed) {
      return <div className="h-2" key={index} />
    }

    if (trimmed.startsWith("### ")) {
      return (
        <h4 className="text-sm font-semibold leading-6" key={index}>
          {renderInlineLinks(trimmed.slice(4))}
        </h4>
      )
    }

    if (trimmed.startsWith("## ")) {
      return (
        <h3 className="text-base font-semibold leading-7" key={index}>
          {renderInlineLinks(trimmed.slice(3))}
        </h3>
      )
    }

    if (trimmed.startsWith("# ")) {
      return (
        <h2 className="text-lg font-semibold leading-7" key={index}>
          {renderInlineLinks(trimmed.slice(2))}
        </h2>
      )
    }

    if (trimmed.startsWith("- ")) {
      return (
        <li className="ml-4 list-disc text-sm leading-6" key={index}>
          {renderInlineLinks(trimmed.slice(2))}
        </li>
      )
    }

    return (
      <p className="text-sm leading-6" key={index}>
        {renderInlineLinks(line)}
      </p>
    )
  })
}

function relativePoint(
  event: { clientX: number; clientY: number },
  element: HTMLElement,
  pan: { x: number; y: number },
  zoom: number,
) {
  const rect = element.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left - pan.x) / zoom,
    y: (event.clientY - rect.top - pan.y) / zoom,
  }
}

function clampZoom(value: number) {
  return Math.min(2.5, Math.max(0.2, value))
}

function colorForUser(id: string) {
  const colors = ["#38bdf8", "#a78bfa", "#34d399", "#f59e0b", "#f472b6"] as const
  let hash = 0
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) % colors.length
  }
  return colors[hash] ?? "#38bdf8"
}

function nodeRect(node: Pick<CanvasNode, "x" | "y" | "width" | "height">) {
  return {
    left: node.x,
    top: node.y,
    right: node.x + node.width,
    bottom: node.y + node.height,
  }
}

function rectsIntersect(
  first: { left: number; top: number; right: number; bottom: number },
  second: { left: number; top: number; right: number; bottom: number },
) {
  return first.left <= second.right && first.right >= second.left && first.top <= second.bottom && first.bottom >= second.top
}

function boundsForNodes(nodes: CanvasNode[]) {
  if (!nodes.length) return null
  const rects = nodes.map(nodeRect)
  const left = Math.min(...rects.map((rect) => rect.left))
  const top = Math.min(...rects.map((rect) => rect.top))
  const right = Math.max(...rects.map((rect) => rect.right))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function layoutGroupedNodes(nodes: CanvasNode[], origin: { x: number; y: number }) {
  const padding = 24
  const gap = 20
  const columns = 2
  const maxWidth = Math.max(...nodes.map((node) => node.width), 180)
  const rows = Math.ceil(nodes.length / columns)

  const rowHeights = Array.from({ length: rows }, (_, row) =>
    Math.max(...nodes.filter((_, index) => Math.floor(index / columns) === row).map((node) => node.height)),
  )
  const rowTops = rowHeights.map((_, row) =>
    rowHeights.slice(0, row).reduce((sum, height) => sum + height, 0) + row * gap,
  )

  const positionedNodes = nodes.map((node, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    return {
      ...node,
      x: origin.x + padding + column * (maxWidth + gap),
      y: origin.y + padding + (rowTops[row] ?? 0),
      width: Math.max(node.width, maxWidth),
    }
  })

  const height = rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rows - 1) * gap + padding * 2
  const width = Math.min(nodes.length, columns) * maxWidth + Math.max(0, Math.min(nodes.length, columns) - 1) * gap + padding * 2

  return { positionedNodes, group: { x: origin.x, y: origin.y, width, height } }
}

function resizeNodeBox(
  box: NodeBox,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
) {
  const minWidth = 140
  const minHeight = 90
  let { x, y, width, height } = box

  if (handle.includes("e")) {
    width = Math.max(minWidth, box.width + deltaX)
  }

  if (handle.includes("s")) {
    height = Math.max(minHeight, box.height + deltaY)
  }

  if (handle.includes("w")) {
    const nextWidth = Math.max(minWidth, box.width - deltaX)
    x = box.x + box.width - nextWidth
    width = nextWidth
  }

  if (handle.includes("n")) {
    const nextHeight = Math.max(minHeight, box.height - deltaY)
    y = box.y + box.height - nextHeight
    height = nextHeight
  }

  return { x, y, width, height }
}

function scrollNodeContent(event: WheelEvent<HTMLElement>) {
  if (event.ctrlKey) return

  event.preventDefault()
  event.stopPropagation()
  event.currentTarget.scrollTop += event.deltaY
}

async function copyToClipboard(value: string) {
  if (!value.trim()) return
  await navigator.clipboard?.writeText(value)
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U"
}

function AvatarBadge({
  color,
  imageUrl,
  label,
  size = "sm",
}: {
  color: string
  imageUrl?: string
  label: string
  size?: "sm" | "md"
}) {
  const sizeClass = size === "md" ? "size-8 text-xs" : "size-7 text-[11px]"

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full border border-[#09090b] font-semibold text-white",
        sizeClass,
      )}
      style={{ backgroundColor: color }}
      title={label}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={label} className="h-full w-full object-cover" src={imageUrl} />
      ) : (
        initials(label)
      )}
    </span>
  )
}

function RoleIcon({ role }: { role: MemberRole }) {
  if (role === "owner") return <Shield className="size-4 text-[#facc15]" />
  if (role === "editor") return <Pencil className="size-4 text-[#a5b4fc]" />
  return <Eye className="size-4 text-[#94a3b8]" />
}

function AppSkeleton() {
  return (
    <main className="dark flex h-svh overflow-hidden bg-[#09090b] text-[#f4f4f5]">
      <aside className="w-[300px] border-r border-[#27272a] bg-[#111113] p-4">
        <div className="mb-5 h-6 w-36 animate-pulse rounded bg-[#27272a]" />
        <div className="mb-4 h-9 w-full animate-pulse rounded bg-[#18181b]" />
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div className="h-24 animate-pulse rounded-md border border-[#27272a] bg-[#18181b]" key={item} />
          ))}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center justify-between border-b border-[#27272a] bg-[#111113] px-4">
          <div className="h-5 w-48 animate-pulse rounded bg-[#27272a]" />
          <div className="h-8 w-32 animate-pulse rounded bg-[#18181b]" />
        </div>
        <div className="relative flex-1 bg-[#09090b]">
          <div className="absolute left-1/3 top-1/3 h-40 w-72 animate-pulse rounded-lg bg-[#18181b]" />
          <div className="absolute left-1/2 top-1/2 h-32 w-64 animate-pulse rounded-lg bg-[#18181b]" />
        </div>
      </section>
    </main>
  )
}

export function CollabApp() {
  const { isLoaded, user } = useUser()
  const currentUser = useMemo(
    () => ({
      id: user?.id ?? "loading",
      name: user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "User",
      email: user?.primaryEmailAddress?.emailAddress ?? "",
      avatarUrl: user?.imageUrl,
      color: colorForUser(user?.id ?? "loading"),
    }),
    [user],
  )
  const liveSessions = useQuery(
    api.sessions.list,
    isConvexConfigured ? {} : "skip",
  ) as Session[] | undefined
  const liveAccounts = useQuery(
    api.accounts.list,
    isConvexConfigured ? {} : "skip",
  ) as Account[] | undefined
  const seed = useMutation(api.bootstrap.seed)
  const createProject = useMutation(api.accounts.create)
  const updateProject = useMutation(api.accounts.update)
  const createNode = useMutation(api.nodes.create)
  const updateNode = useMutation(api.nodes.update)
  const deleteNodeMutation = useMutation(api.nodes.remove)
  const createGroup = useMutation(api.groups.create)
  const updateGroup = useMutation(api.groups.update)
  const deleteGroupMutation = useMutation(api.groups.remove)
  const createSession = useMutation(api.sessions.create)
  const updateSession = useMutation(api.sessions.update)
  const generateUploadUrl = useMutation(api.nodes.generateUploadUrl)
  const sendMessage = useMutation(api.chat.send)
  const heartbeat = useMutation(api.presence.heartbeat)
  const inviteUser = useMutation(api.invites.invite)
  const acceptInvite = useMutation(api.invites.accept)
  const declineInvite = useMutation(api.invites.decline)
  const updateCollaboratorRole = useMutation(api.invites.updateCollaboratorRole)
  const removeCollaborator = useMutation(api.invites.removeCollaborator)
  const markNotificationRead = useMutation(api.invites.markNotificationRead)
  const upsertUser = useMutation(api.users.upsert)

  const [localSessions, setLocalSessions] = useState<Session[]>([])
  const isAppLoading = !isLoaded || (isConvexConfigured && (liveSessions === undefined || liveAccounts === undefined))
  const sessions = useMemo(
    () => (isConvexConfigured ? (liveSessions ?? []) : localSessions),
    [liveSessions, localSessions],
  )
  const accounts = useMemo(
    () => (isConvexConfigured ? (liveAccounts ?? []) : fallbackAccounts),
    [liveAccounts],
  )
  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0]?._id)
  const currentSession = sessions.find((session) => session._id === selectedSessionId) ?? sessions[0]

  const liveNodes = useQuery(
    api.nodes.list,
    isConvexConfigured && currentSession && !currentSession._id.startsWith("local")
      ? { sessionId: sessionId(currentSession._id) }
      : "skip",
  ) as CanvasNode[] | undefined
  const liveMessages = useQuery(
    api.chat.list,
    isConvexConfigured && currentSession && !currentSession._id.startsWith("local")
      ? { sessionId: sessionId(currentSession._id) }
      : "skip",
  ) as Message[] | undefined
  const livePresence = useQuery(
    api.presence.list,
    isConvexConfigured && currentSession && !currentSession._id.startsWith("local")
      ? { sessionId: sessionId(currentSession._id) }
      : "skip",
  ) as Presence[] | undefined
  const liveGroups = useQuery(
    api.groups.list,
    isConvexConfigured && currentSession && !currentSession._id.startsWith("local")
      ? { sessionId: sessionId(currentSession._id) }
      : "skip",
  ) as CanvasGroup[] | undefined
  const sessionAccess = useQuery(
    api.invites.listForSession,
    isConvexConfigured && currentSession && !currentSession._id.startsWith("local")
      ? { sessionId: sessionId(currentSession._id) }
      : "skip",
  ) as SessionAccess | undefined
  const userInbox = useQuery(
    api.invites.listForUser,
    isLoaded && isConvexConfigured && currentUser.email
      ? { userId: currentUser.id, email: currentUser.email.toLowerCase() }
      : "skip",
  ) as UserInbox | undefined

  const [localNodes, setLocalNodes] = useState<CanvasNode[]>([])
  const [localGroups, setLocalGroups] = useState<CanvasGroup[]>([])
  const [localMessages, setLocalMessages] = useState<Message[]>([])
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [selectedNodeId, setSelectedNodeId] = useState<string>()
  const [selectedGroupId, setSelectedGroupId] = useState<string>()
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [editingSessionId, setEditingSessionId] = useState<string>()
  const [draftPositions, setDraftPositions] = useState<Record<string, Partial<Pick<CanvasNode, "x" | "y" | "width" | "height">>>>({})
  const [draftNodeContent, setDraftNodeContent] = useState<Record<string, Pick<CanvasNode, "heading" | "text">>>({})
  const [draftGroups, setDraftGroups] = useState<Record<string, Pick<CanvasGroup, "x" | "y" | "width" | "height">>>({})
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null)
  const [groupNameDraft, setGroupNameDraft] = useState("Group")
  const [chatBody, setChatBody] = useState("")
  const [taggedNodeIds, setTaggedNodeIds] = useState<string[]>([])
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [membersModalOpen, setMembersModalOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [inviteDrafts, setInviteDrafts] = useState<InviteDraft[]>([{ email: "", role: "viewer" }])
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [chatWidth, setChatWidth] = useState(360)
  const [spacePressed, setSpacePressed] = useState(false)
  const lastPresenceAt = useRef(0)
  const localIdCounter = useRef(0)
  const undoStackRef = useRef<Array<() => Promise<void> | void>>([])
  const suppressUndoRef = useRef(false)
  const pinchRef = useRef<{ distance: number; zoom: number; centerX: number; centerY: number } | null>(null)
  const panDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isLoaded || !user || !currentUser.email) return

    void upsertUser({
      userId: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      avatarUrl: currentUser.avatarUrl,
      color: currentUser.color,
    })
  }, [currentUser, isLoaded, upsertUser, user])

  useEffect(() => {
    if (!isConvexConfigured || liveSessions === undefined || liveSessions.length > 0) {
      return
    }

    void seed()
  }, [liveSessions, seed])

  useEffect(() => {
    function down(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault()
        const undo = undoStackRef.current.pop()
        if (!undo) return

        suppressUndoRef.current = true
        Promise.resolve(undo()).finally(() => {
          suppressUndoRef.current = false
        })
        return
      }

      if (event.code === "Space" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault()
        setSpacePressed(true)
      }
    }

    function up(event: KeyboardEvent) {
      if (event.code === "Space") {
        setSpacePressed(false)
        panDragRef.current = null
      }
    }

    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const targetCanvas = canvas

    function wheel(event: globalThis.WheelEvent) {
      if (
        !event.ctrlKey &&
        event.target instanceof HTMLElement &&
        event.target.closest("[data-node-scroll='true']")
      ) {
        return
      }

      event.preventDefault()

      if (!event.ctrlKey) {
        setPan((value) => ({
          x: value.x - (event.shiftKey ? event.deltaY : event.deltaX),
          y: value.y - (event.shiftKey ? 0 : event.deltaY),
        }))
        return
      }

      const rect = targetCanvas.getBoundingClientRect()
      const zoomSensitivity = 0.002
      const nextZoom = clampZoom(zoom * Math.exp(-event.deltaY * zoomSensitivity))
      const worldX = (event.clientX - rect.left - pan.x) / zoom
      const worldY = (event.clientY - rect.top - pan.y) / zoom

      setZoom(nextZoom)
      setPan({
        x: event.clientX - rect.left - worldX * nextZoom,
        y: event.clientY - rect.top - worldY * nextZoom,
      })
    }

    targetCanvas.addEventListener("wheel", wheel, { passive: false })
    return () => targetCanvas.removeEventListener("wheel", wheel)
  }, [pan, zoom])

  useEffect(() => {
    if (isAppLoading) return
    requestAnimationFrame(() => canvasRef.current?.focus({ preventScroll: true }))
  }, [currentSession?._id, isAppLoading])

  const nodes = useMemo(() => {
    const transientNodes = localNodes.filter((node) => node.kind === "image-loading")
    const source = liveNodes ? [...liveNodes, ...transientNodes] : localNodes
    return source.map((node) => ({ ...node, ...draftPositions[node._id], ...draftNodeContent[node._id] }))
  }, [draftNodeContent, draftPositions, liveNodes, localNodes])
  const groups = useMemo(() => {
    const source = liveGroups ?? localGroups
    return source
      .filter((group) => group.nodeIds.some((id) => nodes.some((node) => node._id === id)))
      .map((group) => ({ ...group, ...draftGroups[group._id] }))
  }, [draftGroups, liveGroups, localGroups, nodes])
  const groupedNodeIds = useMemo(
    () => new Set(groups.flatMap((group) => group.nodeIds)),
    [groups],
  )
  const selectedBounds = useMemo(
    () => boundsForNodes(nodes.filter((node) => selectedNodeIds.includes(node._id))),
    [nodes, selectedNodeIds],
  )
  const messages = liveMessages ?? localMessages

  useEffect(() => {
    if (!liveNodes?.length) return

    setDraftNodeContent((items) => {
      let changed = false
      const nextItems = { ...items }

      for (const node of liveNodes) {
        const draft = nextItems[node._id]
        if (!draft) continue

        const textMatches = draft.text === undefined || draft.text === node.text
        const headingMatches = draft.heading === undefined || draft.heading === node.heading

        if (textMatches && headingMatches) {
          delete nextItems[node._id]
          changed = true
        }
      }

      return changed ? nextItems : items
    })
  }, [liveNodes])
  const presence = livePresence ?? []
  const activeParticipants = [
    {
      userId: currentUser.id,
      name: currentUser.name,
      color: currentUser.color,
      avatarUrl: currentUser.avatarUrl,
    },
    ...presence.filter((item) => item.userId !== currentUser.id),
  ]
  const isOwner = Boolean(
    currentSession &&
      (currentSession._id.startsWith("local") ||
        sessionAccess?.collaborators.some(
          (collaborator) => collaborator.userId === currentUser.id && collaborator.role === "owner",
        ) ||
        currentSession.ownerUserId === currentUser.id),
  )
  const canInviteToSession = Boolean(
    currentSession &&
      (currentSession._id.startsWith("local") ||
        sessionAccess?.collaborators.some(
          (collaborator) =>
            collaborator.userId === currentUser.id &&
            (collaborator.role === "owner" || collaborator.role === "editor"),
        ) ||
        currentSession.ownerUserId === currentUser.id),
  )
  const inboxCount = (userInbox?.invitations.length ?? 0) + (userInbox?.notifications.length ?? 0)
  const projectAccounts = useMemo(() => {
    const map = new Map<string, Account>()
    accounts.forEach((account) => map.set(account._id, account))
    sessions.forEach((session) => {
      if (session.account) map.set(session.account._id, session.account)
    })
    return Array.from(map.values())
  }, [accounts, sessions])

  const sessionsByAccount = useMemo(
    () =>
      projectAccounts.map((account) => ({
        account,
        sessions: sessions.filter((session) => session.accountId === account._id),
      })),
    [projectAccounts, sessions],
  )

  if (isAppLoading) {
    return <AppSkeleton />
  }

  function setZoomAround(clientX: number, clientY: number, nextZoom: number) {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const clamped = clampZoom(nextZoom)
    const worldX = (clientX - rect.left - pan.x) / zoom
    const worldY = (clientY - rect.top - pan.y) / zoom

    setZoom(clamped)
    setPan({
      x: clientX - rect.left - worldX * clamped,
      y: clientY - rect.top - worldY * clamped,
    })
  }

  function nextLocalId(prefix: string) {
    localIdCounter.current += 1
    return `${prefix}-${localIdCounter.current}`
  }

  function pushUndo(action: () => Promise<void> | void) {
    if (suppressUndoRef.current) return
    undoStackRef.current = [...undoStackRef.current.slice(-49), action]
  }

  function handleCanvasPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (!spacePressed && event.target !== event.currentTarget)) return

    event.currentTarget.setPointerCapture(event.pointerId)
    if (!spacePressed) {
      const point = relativePoint(event, event.currentTarget, pan, zoom)
      setSelectionBox({ startX: point.x, startY: point.y, x: point.x, y: point.y })
      setSelectedNodeId(undefined)
      setSelectedGroupId(undefined)
      return
    }

    panDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    }
  }

  function handleCanvasPointerUp() {
    panDragRef.current = null
    if (selectionBox) {
      const width = Math.abs(selectionBox.x - selectionBox.startX)
      const height = Math.abs(selectionBox.y - selectionBox.startY)

      if (width < 4 && height < 4) {
        setSelectedNodeId(undefined)
        setSelectedGroupId(undefined)
        setSelectedNodeIds([])
        setSelectionBox(null)
        return
      }

      const rect = {
        left: Math.min(selectionBox.startX, selectionBox.x),
        top: Math.min(selectionBox.startY, selectionBox.y),
        right: Math.max(selectionBox.startX, selectionBox.x),
        bottom: Math.max(selectionBox.startY, selectionBox.y),
      }

      const nextSelectedNodeIds = nodes
        .filter((node) => !groupedNodeIds.has(node._id) && rectsIntersect(nodeRect(node), rect))
        .map((node) => node._id)

      setSelectedNodeIds(nextSelectedNodeIds)
      setSelectedNodeId(undefined)
      setSelectedGroupId(undefined)
      setSelectionBox(null)
    }
  }

  function touchDistance(event: TouchEvent<HTMLDivElement>) {
    const [first, second] = Array.from(event.touches)
    if (!first || !second) return null

    return {
      distance: Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY),
      centerX: (first.clientX + second.clientX) / 2,
      centerY: (first.clientY + second.clientY) / 2,
    }
  }

  function handleCanvasTouchStart(event: TouchEvent<HTMLDivElement>) {
    const pinch = touchDistance(event)
    if (!pinch) return

    pinchRef.current = { ...pinch, zoom }
  }

  function handleCanvasTouchMove(event: TouchEvent<HTMLDivElement>) {
    const pinch = touchDistance(event)
    if (!pinch || !pinchRef.current) return

    event.preventDefault()
    setZoomAround(pinch.centerX, pinch.centerY, pinchRef.current.zoom * (pinch.distance / pinchRef.current.distance))
  }

  function handleCanvasTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length < 2) {
      pinchRef.current = null
    }
  }

  async function submitNewProject(event: FormEvent) {
    event.preventDefault()
    const name = newProjectName.trim()
    if (!name) return

    if (isConvexConfigured) {
      const handle = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || nextLocalId("project")
      const projectId = await createProject({
        name,
        handle,
        color: "#38bdf8",
      })
      const id = await createSession({
        accountId: projectId,
        title: "Session 1",
        ownerUserId: currentUser.id,
      })
      setSelectedSessionId(id)
    } else {
      const projectId = nextLocalId("local-account")
      const sessionIdValue = nextLocalId("local-session")
      const account = { _id: projectId, name, handle: projectId, color: "#38bdf8" }
      setLocalSessions((items) => [
        {
          _id: sessionIdValue,
          title: "Session 1",
          status: "draft",
          accountId: projectId,
          updatedAt: Date.now(),
          account,
        },
        ...items,
      ])
      setSelectedSessionId(sessionIdValue)
    }

    setNewProjectName("")
    setProjectModalOpen(false)
  }

  async function createSessionForProject(project: Account, count: number) {
    const title = `Session ${count + 1}`
    if (isConvexConfigured && !project._id.startsWith("local")) {
      const id = await createSession({
        accountId: accountId(project._id),
        title,
        ownerUserId: currentUser.id,
      })
      setSelectedSessionId(id)
      return
    }

    const sessionIdValue = nextLocalId("local-session")
    setLocalSessions((items) => [
      {
        _id: sessionIdValue,
        title,
        status: "draft",
        accountId: project._id,
        updatedAt: Date.now(),
        account: project,
      },
      ...items,
    ])
    setSelectedSessionId(sessionIdValue)
  }

  async function renameProject(project: Account, name: string) {
    const nextName = name.trim()
    if (!nextName || nextName === project.name) return

    if (isConvexConfigured && !project._id.startsWith("local")) {
      await updateProject({ accountId: accountId(project._id), name: nextName })
      return
    }

    setLocalSessions((items) =>
      items.map((session) =>
        session.accountId === project._id
          ? { ...session, account: { ...(session.account ?? project), name: nextName } }
          : session,
      ),
    )
  }

  async function renameSession(session: Session, title: string) {
    const nextTitle = title.trim()
    if (!nextTitle || nextTitle === session.title) return

    if (isConvexConfigured && !session._id.startsWith("local")) {
      await updateSession({ sessionId: sessionId(session._id), title: nextTitle })
      return
    }

    setLocalSessions((items) =>
      items.map((item) => (item._id === session._id ? { ...item, title: nextTitle } : item)),
    )
  }

  async function updateNodeHeading(id: string, heading: string) {
    const previous = nodes.find((node) => node._id === id)?.heading
    if (previous === heading) return

    pushUndo(async () => {
      if (isConvexConfigured && !id.startsWith("local")) {
        setDraftNodeContent((items) => ({ ...items, [id]: { ...items[id], heading: previous } }))
        await updateNode({ nodeId: nodeId(id), heading: previous ?? "", userId: currentUser.id })
      } else {
        setLocalNodes((items) =>
          items.map((item) => (item._id === id ? { ...item, heading: previous } : item)),
        )
      }
    })

    if (isConvexConfigured && !id.startsWith("local")) {
      setDraftNodeContent((items) => ({ ...items, [id]: { ...items[id], heading } }))
      await updateNode({ nodeId: nodeId(id), heading, userId: currentUser.id })
      return
    }

    setLocalNodes((items) =>
      items.map((item) => (item._id === id ? { ...item, heading } : item)),
    )
  }

  async function updateNodeText(id: string, text: string) {
    const previous = nodes.find((node) => node._id === id)?.text
    if ((previous ?? "") === text) return

    pushUndo(async () => {
      if (isConvexConfigured && !id.startsWith("local")) {
        setDraftNodeContent((items) => ({ ...items, [id]: { ...items[id], text: previous } }))
        await updateNode({ nodeId: nodeId(id), text: previous ?? "", userId: currentUser.id })
      } else {
        setLocalNodes((items) =>
          items.map((item) => (item._id === id ? { ...item, text: previous } : item)),
        )
      }
    })

    if (isConvexConfigured && !id.startsWith("local")) {
      setDraftNodeContent((items) => ({ ...items, [id]: { ...items[id], text } }))
      await updateNode({ nodeId: nodeId(id), text, userId: currentUser.id })
      return
    }

    setLocalNodes((items) =>
      items.map((item) => (item._id === id ? { ...item, text } : item)),
    )
  }

  async function deleteNode(id: string) {
    const previous = nodes.find((node) => node._id === id)
    if (previous) {
      pushUndo(async () => {
        if (previous.kind === "image-loading") {
          setLocalNodes((items) => [...items, previous])
        } else if (isConvexConfigured && currentSession && !currentSession._id.startsWith("local") && !id.startsWith("local")) {
          await createNode({
            sessionId: sessionId(currentSession._id),
            kind: previous.kind,
            x: previous.x,
            y: previous.y,
            width: previous.width,
            height: previous.height,
            heading: previous.heading,
            text: previous.text,
            localImageUrl: previous.localImageUrl,
            userId: currentUser.id,
          })
        } else {
          setLocalNodes((items) => [...items, previous])
        }
      })
    }

    if (isConvexConfigured && !id.startsWith("local")) {
      await deleteNodeMutation({ nodeId: nodeId(id), userId: currentUser.id })
    } else {
      setLocalNodes((items) => items.filter((item) => item._id !== id))
    }

    setSelectedNodeId((value) => (value === id ? undefined : value))
    setSelectedNodeIds((items) => items.filter((item) => item !== id))
    setDraftNodeContent((items) => {
      const nextItems = { ...items }
      delete nextItems[id]
      return nextItems
    })
    setTaggedNodeIds((items) => items.filter((item) => item !== id))
  }

  async function updateGroupName(id: string, name: string) {
    const nextName = name.trim() || "Group"
    const previous = groups.find((group) => group._id === id)?.name
    if (previous === nextName) return

    pushUndo(async () => {
      if (isConvexConfigured && !id.startsWith("local")) {
        await updateGroup({ groupId: groupId(id), name: previous ?? "Group", userId: currentUser.id })
      } else {
        setLocalGroups((items) => items.map((item) => (item._id === id ? { ...item, name: previous ?? "Group" } : item)))
      }
    })

    if (isConvexConfigured && !id.startsWith("local")) {
      await updateGroup({ groupId: groupId(id), name: nextName, userId: currentUser.id })
      return
    }

    setLocalGroups((items) => items.map((item) => (item._id === id ? { ...item, name: nextName } : item)))
  }

  async function ungroupNodes(id: string) {
    const group = groups.find((item) => item._id === id)
    if (!group) return

    pushUndo(async () => {
      if (isConvexConfigured && currentSession && !currentSession._id.startsWith("local") && !id.startsWith("local")) {
        await createGroup({
          sessionId: sessionId(currentSession._id),
          name: group.name,
          nodeIds: group.nodeIds,
          x: group.x,
          y: group.y,
          width: group.width,
          height: group.height,
          userId: currentUser.id,
        })
      } else {
        setLocalGroups((items) => [...items, group])
      }
    })

    if (isConvexConfigured && !id.startsWith("local")) {
      await deleteGroupMutation({ groupId: groupId(id), userId: currentUser.id })
    } else {
      setLocalGroups((items) => items.filter((item) => item._id !== id))
    }

    setSelectedGroupId(undefined)
    setSelectedNodeIds(group.nodeIds)
    setTaggedNodeIds((items) => items.filter((item) => item !== `group:${id}`))
  }

  async function groupSelectedNodes() {
    if (!currentSession || selectedNodeIds.length < 2) return
    const selectedNodes = selectedNodeIds
      .map((id) => nodes.find((node) => node._id === id))
      .filter(Boolean) as CanvasNode[]
    const bounds = boundsForNodes(selectedNodes)
    if (!bounds) return

    const name = groupNameDraft.trim() || "Group"
    const layout = layoutGroupedNodes(selectedNodes, { x: bounds.x, y: bounds.y })
    const previousNodes = selectedNodes.map((node) => ({ ...node }))

    await Promise.all(
      layout.positionedNodes.map((node) => {
        if (isConvexConfigured && !node._id.startsWith("local")) {
          return updateNode({ nodeId: nodeId(node._id), x: node.x, y: node.y, width: node.width, userId: currentUser.id })
        }

        setLocalNodes((items) => items.map((item) => (item._id === node._id ? { ...item, x: node.x, y: node.y, width: node.width } : item)))
        return Promise.resolve()
      }),
    )

    if (isConvexConfigured && !currentSession._id.startsWith("local")) {
      const id = await createGroup({
        sessionId: sessionId(currentSession._id),
        name,
        nodeIds: selectedNodes.map((node) => node._id),
        ...layout.group,
        userId: currentUser.id,
      })
      pushUndo(async () => {
        await deleteGroupMutation({ groupId: id, userId: currentUser.id })
        await Promise.all(
          previousNodes.map((node) =>
            updateNode({ nodeId: nodeId(node._id), x: node.x, y: node.y, width: node.width, height: node.height, userId: currentUser.id }),
          ),
        )
      })
    } else {
      const id = nextLocalId("local-group")
      setLocalGroups((items) => [
        ...items,
        {
          _id: id,
          name,
          nodeIds: selectedNodes.map((node) => node._id),
          ...layout.group,
        },
      ])
      pushUndo(() => {
        setLocalGroups((items) => items.filter((item) => item._id !== id))
        setLocalNodes((items) =>
          items.map((item) => previousNodes.find((node) => node._id === item._id) ?? item),
        )
      })
    }

    setDraftPositions({})
    setSelectedNodeIds([])
    setGroupNameDraft("Group")
  }

  async function moveGroup(group: CanvasGroup, next: Pick<CanvasGroup, "x" | "y">) {
    const dx = next.x - group.x
    const dy = next.y - group.y
    if (!dx && !dy) return

    const childNodes = nodes.filter((node) => group.nodeIds.includes(node._id))
    const previousNodes = childNodes.map((node) => ({ ...node }))
    const previousGroup = { ...group }

    pushUndo(async () => {
      if (isConvexConfigured && !group._id.startsWith("local")) {
        await Promise.all([
          updateGroup({ groupId: groupId(group._id), x: previousGroup.x, y: previousGroup.y, userId: currentUser.id }),
          ...previousNodes.map((node) =>
            updateNode({ nodeId: nodeId(node._id), x: node.x, y: node.y, userId: currentUser.id }),
          ),
        ])
      } else {
        setLocalGroups((items) => items.map((item) => (item._id === previousGroup._id ? previousGroup : item)))
        setLocalNodes((items) =>
          items.map((item) => previousNodes.find((node) => node._id === item._id) ?? item),
        )
      }
    })

    if (isConvexConfigured && !group._id.startsWith("local")) {
      await Promise.all([
        updateGroup({ groupId: groupId(group._id), x: next.x, y: next.y, userId: currentUser.id }),
        ...childNodes.map((node) =>
          updateNode({ nodeId: nodeId(node._id), x: node.x + dx, y: node.y + dy, userId: currentUser.id }),
        ),
      ])
    } else {
      setLocalGroups((items) => items.map((item) => (item._id === group._id ? { ...item, x: next.x, y: next.y } : item)))
      setLocalNodes((items) =>
        items.map((item) =>
          group.nodeIds.includes(item._id) ? { ...item, x: item.x + dx, y: item.y + dy } : item,
        ),
      )
    }

    setDraftGroups((items) => {
      const nextItems = { ...items }
      delete nextItems[group._id]
      return nextItems
    })
  }

  async function addNode(input: Partial<CanvasNode> & { kind: "text" | "image" | "mixed"; x: number; y: number }) {
    if (isConvexConfigured && currentSession && !currentSession._id.startsWith("local")) {
      const id = await createNode({
        sessionId: sessionId(currentSession._id),
        kind: input.kind,
        x: input.x,
        y: input.y,
        width: input.width ?? 300,
        height: input.height ?? 160,
        heading: input.heading ?? nodeHeading(input),
        text: input.text,
        localImageUrl: input.localImageUrl,
        userId: currentUser.id,
      })
      pushUndo(async () => {
        await deleteNodeMutation({ nodeId: id, userId: currentUser.id })
      })
      setSelectedNodeId(id)
      return
    }

    const id = `local-node-${Date.now()}`
    setLocalNodes((items) => [
      ...items,
      {
        _id: id,
        kind: input.kind,
        x: input.x,
        y: input.y,
        width: input.width ?? 300,
        height: input.height ?? 160,
        heading: input.heading ?? nodeHeading(input),
        text: input.text,
        imageUrl: input.imageUrl,
        localImageUrl: input.localImageUrl,
      },
    ])
    pushUndo(() => setLocalNodes((items) => items.filter((item) => item._id !== id)))
    setSelectedNodeId(id)
  }

  async function addImageFile(file: File, x: number, y: number) {
    const placeholderId = nextLocalId("uploading-image")
    const placeholder: CanvasNode = {
      _id: placeholderId,
      kind: "image-loading",
      x,
      y,
      width: 360,
      height: 260,
      heading: file.name.replace(/\.[^.]+$/, "") || "Pasted image",
    }

    setLocalNodes((items) => [...items, placeholder])
    setSelectedNodeId(placeholderId)

    if (isConvexConfigured && currentSession && !currentSession._id.startsWith("local")) {
      try {
        const postUrl = await generateUploadUrl()
        const result = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        })
        const { storageId } = await result.json()
        const id = await createNode({
          sessionId: sessionId(currentSession._id),
          kind: "image",
          x,
          y,
          width: 360,
          height: 260,
          heading: file.name.replace(/\.[^.]+$/, "") || "Pasted image",
          storageId,
          userId: currentUser.id,
        })
        pushUndo(async () => {
          await deleteNodeMutation({ nodeId: id, userId: currentUser.id })
        })
        setSelectedNodeId(id)
      } finally {
        setLocalNodes((items) => items.filter((item) => item._id !== placeholderId))
      }
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const imageUrl = String(reader.result)
      setLocalNodes((items) =>
        items.map((item) =>
          item._id === placeholderId
            ? {
                ...item,
                kind: "image",
                width: 320,
                height: 220,
                localImageUrl: imageUrl,
                imageUrl,
              }
            : item,
        ),
      )
      pushUndo(() => setLocalNodes((items) => items.filter((item) => item._id !== placeholderId)))
      setSelectedNodeId(placeholderId)
    }
    reader.onerror = () => {
      setLocalNodes((items) => items.filter((item) => item._id !== placeholderId))
    }
    reader.readAsDataURL(file)
  }

  async function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const canvas = canvasRef.current
    if (!canvas) return

    const point = {
      x: (canvas.clientWidth / 2 - pan.x) / zoom,
      y: (canvas.clientHeight / 2 - pan.y) / zoom,
    }
    const image = Array.from(event.clipboardData.files).find((file) =>
      file.type.startsWith("image/"),
    )
    if (image) {
      event.preventDefault()
      await addImageFile(image, point.x, point.y)
      return
    }

    const text = event.clipboardData.getData("text/plain").trim()
    if (!text) return

    event.preventDefault()
    await addNode({
      kind: "text",
      x: point.x,
      y: point.y,
      width: isProbablyUrl(text) ? 310 : 320,
      height: isProbablyUrl(text) ? 132 : 170,
      text,
      heading: nodeHeading({ kind: "text", text }),
    })
  }

  function handleCanvasPointerMove(event: PointerEvent<HTMLDivElement>) {
    const canvas = canvasRef.current
    if (!canvas || !currentSession) return

    if (panDragRef.current) {
      setPan({
        x: panDragRef.current.panX + event.clientX - panDragRef.current.startX,
        y: panDragRef.current.panY + event.clientY - panDragRef.current.startY,
      })
      return
    }

    const point = relativePoint(event, canvas, pan, zoom)
    if (selectionBox) {
      setSelectionBox((value) => (value ? { ...value, x: point.x, y: point.y } : value))
      return
    }

    const now = Date.now()
    if (isConvexConfigured && now - lastPresenceAt.current > 450 && !currentSession._id.startsWith("local")) {
      lastPresenceAt.current = now
      void heartbeat({
        sessionId: sessionId(currentSession._id),
        userId: currentUser.id,
        name: currentUser.name,
        avatarUrl: currentUser.avatarUrl,
        color: currentUser.color,
        cursorX: point.x,
        cursorY: point.y,
        activeNodeId: selectedNodeId,
      })
    }
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault()
    if (!chatBody.trim() || !currentSession) return

    if (isConvexConfigured && !currentSession._id.startsWith("local")) {
      await sendMessage({
        sessionId: sessionId(currentSession._id),
        userId: currentUser.id,
        body: chatBody.trim(),
        taggedNodeIds,
      })
    } else {
      setLocalMessages((items) => [
        ...items,
        {
          _id: `local-message-${Date.now()}`,
          userId: currentUser.id,
          body: chatBody.trim(),
          taggedNodeIds,
          createdAt: Date.now(),
        },
      ])
    }

    setChatBody("")
    setTaggedNodeIds([])
  }

  function centerNode(nodeId: string) {
    if (nodeId.startsWith("group:")) {
      const group = groups.find((item) => item._id === nodeId.slice("group:".length))
      const canvas = canvasRef.current
      if (!group || !canvas) return

      setSelectedGroupId(group._id)
      setSelectedNodeId(undefined)
      setPan({
        x: canvas.clientWidth / 2 - (group.x + group.width / 2) * zoom,
        y: canvas.clientHeight / 2 - (group.y + group.height / 2) * zoom,
      })
      return
    }

    const node = nodes.find((item) => item._id === nodeId)
    const canvas = canvasRef.current
    if (!node || !canvas) return

    setSelectedNodeId(nodeId)
    setPan({
      x: canvas.clientWidth / 2 - (node.x + node.width / 2) * zoom,
      y: canvas.clientHeight / 2 - (node.y + node.height / 2) * zoom,
    })
  }

  function tagLabel(id: string) {
    if (id.startsWith("group:")) {
      return groupHeading(groups.find((group) => group._id === id.slice("group:".length)))
    }

    return nodeHeading(nodes.find((node) => node._id === id))
  }

  function updateInviteDraft(index: number, patch: Partial<InviteDraft>) {
    setInviteDrafts((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    )
  }

  function resetInviteDrafts() {
    setInviteDrafts([{ email: "", role: "viewer" }])
  }

  async function submitInvites(event: FormEvent) {
    event.preventDefault()
    if (!currentSession || currentSession._id.startsWith("local")) {
      resetInviteDrafts()
      return
    }

    const drafts = inviteDrafts
      .map((draft) => ({ ...draft, email: draft.email.trim().toLowerCase() }))
      .filter((draft) => draft.email.includes("@"))

    await Promise.all(
      drafts.map((draft) =>
        inviteUser({
          sessionId: sessionId(currentSession._id),
          invitedEmail: draft.email,
          invitedByUserId: currentUser.id,
          role: draft.role,
        }),
      ),
    )

    resetInviteDrafts()
    setInviteModalOpen(false)
  }

  async function acceptProjectInvite(invite: SessionInvite) {
    await acceptInvite({ inviteId: inviteId(invite._id), userId: currentUser.id })
  }

  async function declineProjectInvite(invite: SessionInvite) {
    await declineInvite({ inviteId: inviteId(invite._id), userId: currentUser.id })
  }

  return (
    <main className="dark flex h-svh overflow-hidden bg-[#09090b] text-[#f4f4f5]">
      {projectModalOpen ? (
        <div className="fixed inset-0 z-50 grid animate-in fade-in-0 place-items-center bg-black/60 px-4 duration-150">
          <form
            className="w-full max-w-sm animate-in zoom-in-95 slide-in-from-bottom-2 rounded-lg border border-[#27272a] bg-[#111113] p-4 shadow-xl duration-200 ease-out"
            onSubmit={submitNewProject}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">New Project</h2>
              <button className="text-[#a1a1aa] hover:text-white" onClick={() => setProjectModalOpen(false)} type="button">
                ×
              </button>
            </div>
            <input
              autoFocus
              className="mb-3 h-10 w-full rounded-md border border-[#27272a] bg-[#18181b] px-3 text-sm outline-none focus:border-[#52525b]"
              onChange={(event) => setNewProjectName(event.target.value)}
              placeholder="Project name"
              value={newProjectName}
            />
            <Button className="w-full" type="submit">
              <Plus />
              Create
            </Button>
          </form>
        </div>
      ) : null}
      {inviteModalOpen ? (
        <div className="fixed inset-0 z-[60] grid animate-in fade-in-0 place-items-center bg-black/60 px-4 duration-150">
          <form
            className="w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-2 rounded-lg border border-[#27272a] bg-[#111113] p-4 shadow-xl duration-200 ease-out"
            onSubmit={submitInvites}
          >
            <div className="mb-4 flex items-center justify-between">
              <MailPlus className="size-5 text-[#d4d4d8]" />
              <button
                className="grid size-8 place-items-center rounded-md text-[#a1a1aa] hover:bg-[#27272a] hover:text-white"
                onClick={() => setInviteModalOpen(false)}
                type="button"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-2">
              {inviteDrafts.map((draft, index) => (
                <div className="flex items-center gap-2" key={index}>
                  <input
                    autoFocus={index === 0}
                    className="h-10 min-w-0 flex-1 rounded-md border border-[#27272a] bg-[#18181b] px-3 text-sm outline-none focus:border-[#52525b]"
                    onChange={(event) => updateInviteDraft(index, { email: event.target.value })}
                    placeholder="friend@email.com"
                    type="email"
                    value={draft.email}
                  />
                  <button
                    className={cn(
                      "grid size-10 place-items-center rounded-md border border-[#27272a]",
                      draft.role === "viewer" ? "bg-[#27272a] text-white" : "text-[#a1a1aa]",
                    )}
                    onClick={() => updateInviteDraft(index, { role: "viewer" })}
                    title="Viewer"
                    type="button"
                  >
                    <Eye className="size-4" />
                  </button>
                  <button
                    className={cn(
                      "grid size-10 place-items-center rounded-md border border-[#27272a]",
                      draft.role === "editor" ? "bg-[#27272a] text-white" : "text-[#a1a1aa]",
                    )}
                    onClick={() => updateInviteDraft(index, { role: "editor" })}
                    title="Editor"
                    type="button"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    className="grid size-10 place-items-center rounded-md text-[#a1a1aa] hover:bg-[#3f1d1d] hover:text-[#fca5a5]"
                    onClick={() =>
                      setInviteDrafts((items) =>
                        items.length === 1 ? [{ email: "", role: "viewer" }] : items.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    type="button"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Button
                size="icon-sm"
                type="button"
                variant="outline"
                onClick={() => setInviteDrafts((items) => [...items, { email: "", role: "viewer" }])}
              >
                <Plus />
              </Button>
              <Button size="sm" type="submit">
                <MailPlus />
              </Button>
            </div>
          </form>
        </div>
      ) : null}
      {membersModalOpen && isOwner ? (
        <div className="fixed inset-0 z-50 grid animate-in fade-in-0 place-items-center bg-black/60 px-4 duration-150">
          <div className="w-full max-w-lg animate-in zoom-in-95 slide-in-from-bottom-2 rounded-lg border border-[#27272a] bg-[#111113] p-4 shadow-xl duration-200 ease-out">
            <div className="mb-4 flex items-center justify-between">
              <Settings className="size-5 text-[#d4d4d8]" />
              <div className="flex items-center gap-2">
                <Button
                  size="icon-sm"
                  type="button"
                  variant="outline"
                  onClick={() => setInviteModalOpen(true)}
                >
                  <MailPlus />
                </Button>
                <button
                  className="grid size-8 place-items-center rounded-md text-[#a1a1aa] hover:bg-[#27272a] hover:text-white"
                  onClick={() => setMembersModalOpen(false)}
                  type="button"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto">
              {sessionAccess?.collaborators.map((collaborator) => (
                <div className="flex items-center gap-3 rounded-md border border-[#27272a] bg-[#18181b] p-2" key={collaborator._id}>
                  <AvatarBadge
                    color={collaborator.user?.color ?? colorForUser(collaborator.userId)}
                    imageUrl={collaborator.user?.avatarUrl}
                    label={collaborator.user?.name ?? collaborator.user?.email ?? collaborator.userId}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{collaborator.user?.name ?? collaborator.userId}</div>
                    <div className="truncate text-xs text-[#71717a]">{collaborator.user?.email ?? collaborator.userId}</div>
                  </div>
                  <RoleIcon role={collaborator.role} />
                  {collaborator.role !== "owner" ? (
                    <>
                      <select
                        className="h-9 rounded-md border border-[#27272a] bg-[#111113] px-2 text-sm outline-none"
                        onChange={(event) =>
                          void updateCollaboratorRole({
                            collaboratorId: collaboratorId(collaborator._id),
                            actorUserId: currentUser.id,
                            role: event.target.value as InviteRole,
                          })
                        }
                        value={collaborator.role}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                      </select>
                      <Button
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          void removeCollaborator({
                            collaboratorId: collaboratorId(collaborator._id),
                            actorUserId: currentUser.id,
                          })
                        }
                      >
                        <UserMinus />
                      </Button>
                    </>
                  ) : null}
                </div>
              ))}
              {sessionAccess?.invites
                .filter((invite) => invite.status === "pending")
                .map((invite) => (
                  <div
                    className="flex items-center gap-3 rounded-md border border-[#27272a] bg-[#18181b]/45 p-2 text-[#71717a]"
                    key={invite._id}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[#27272a]">
                      <Clock3 className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1 truncate text-sm">{invite.invitedEmail}</div>
                    <RoleIcon role={invite.role} />
                  </div>
                ))}
            </div>
          </div>
        </div>
      ) : null}
      {notificationsOpen ? (
        <div className="fixed right-4 top-16 z-50 w-[360px] animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 rounded-lg border border-[#27272a] bg-[#111113] p-2 shadow-xl duration-150 ease-out">
          <div className="mb-1 flex justify-end">
            <button
              className="grid size-8 place-items-center rounded-md text-[#a1a1aa] hover:bg-[#27272a] hover:text-white"
              onClick={() => setNotificationsOpen(false)}
              type="button"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="max-h-[420px] space-y-2 overflow-y-auto">
            {userInbox?.invitations.map((invite) => (
              <div className="flex items-center gap-3 rounded-md border border-[#27272a] bg-[#18181b] p-2" key={invite._id}>
                <MailPlus className="size-4 shrink-0 text-[#a5b4fc]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{invite.session?.title ?? "Session"}</div>
                  <div className="flex items-center gap-1 text-xs text-[#71717a]">
                    <RoleIcon role={invite.role} />
                  </div>
                </div>
                <Button size="icon-sm" type="button" variant="ghost" onClick={() => void acceptProjectInvite(invite)}>
                  <Check />
                </Button>
                <Button size="icon-sm" type="button" variant="ghost" onClick={() => void declineProjectInvite(invite)}>
                  <X />
                </Button>
              </div>
            ))}
            {userInbox?.notifications.map((notification) => (
              <div className="flex items-center gap-3 rounded-md border border-[#27272a] bg-[#18181b] p-2" key={notification._id}>
                <X className="size-4 shrink-0 text-[#fca5a5]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{notification.message}</div>
                  <div className="truncate text-xs text-[#71717a]">{notification.session?.title ?? "Session"}</div>
                </div>
                <Button
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() => void markNotificationRead({ notificationId: notificationId(notification._id) })}
                >
                  <Check />
                </Button>
              </div>
            ))}
            {!inboxCount ? (
              <div className="grid h-20 place-items-center text-sm text-[#71717a]">
                <Bell className="size-4" />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-[#27272a] bg-[#111113]">
        <div className="flex items-center border-b border-[#27272a] h-14 px-4">
          <h1 className={cn(caveat.className, "text-3xl font-bold leading-none")}>Coolab</h1>
        </div>

        <div className="border-b border-[#27272a] p-3">
          <Button className="w-full justify-start rounded-md" onClick={() => setProjectModalOpen(true)} variant="outline">
            <Plus />
            New Project
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {sessionsByAccount.map(({ account, sessions: accountSessions }) => (
            <section className="rounded-md border border-[#27272a] bg-[#18181b]" key={account._id}>
              <div className="flex items-center gap-2 border-b border-[#27272a] px-2 py-2">
                <span className="size-2 rounded-full" style={{ backgroundColor: account.color }} />
                <Folder className="size-4 text-[#a1a1aa]" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                  defaultValue={account.name}
                  onBlur={(event) => void renameProject(account, event.currentTarget.value)}
                />
                <Button
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                  onClick={() => void createSessionForProject(account, accountSessions.length)}
                >
                  <Plus />
                </Button>
              </div>
              <div className="flex flex-col space-y-1 p-1">
                {accountSessions.map((session) => (
                  <div
                    className={cn(
                      "group flex items-center gap-1 rounded-md px-2 py-1.5",
                      currentSession?._id === session._id ? "bg-[#27272a]" : "hover:bg-[#202024]",
                    )}
                    key={session._id}
                    onClick={() => {
                      if (currentSession?._id === session._id) {
                        setEditingSessionId(session._id)
                        return
                      }

                      setSelectedSessionId(session._id)
                      setEditingSessionId(undefined)
                    }}
                  >
                    <button
                      className="shrink-0"
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedSessionId(session._id)
                        setEditingSessionId(undefined)
                      }}
                      type="button"
                    >
                      <ChevronRight className="size-4 text-[#71717a]" />
                    </button>
                    {editingSessionId === session._id ? (
                      <input
                        autoFocus
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        defaultValue={session.title}
                        onBlur={(event) => {
                          void renameSession(session, event.currentTarget.value)
                          setEditingSessionId(undefined)
                        }}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          event.stopPropagation()
                          if (event.key === "Enter") {
                            event.currentTarget.blur()
                          }
                          if (event.key === "Escape") {
                            setEditingSessionId(undefined)
                          }
                        }}
                      />
                    ) : (
                      <button
                        className="min-w-0 flex-1 truncate bg-transparent text-left text-sm outline-none"
                        type="button"
                      >
                        {session.title}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#27272a] bg-[#111113] px-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold">{currentSession?.title}</h2>
              {!isConvexConfigured ? (
                <span className="rounded-full bg-[#fff1c2] px-2 py-0.5 text-xs text-[#755b00]">
                  local preview
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon-sm" variant="outline" onClick={() => setZoomAround(window.innerWidth / 2, window.innerHeight / 2, zoom / 1.15)}>
              <Minus />
            </Button>
            <span className="rounded-md border border-[#27272a] bg-[#18181b] px-2 py-1 text-xs font-medium text-[#d4d4d8]">
              {Math.round(zoom * 100)}%
            </span>
            <Button size="icon-sm" variant="outline" onClick={() => setZoomAround(window.innerWidth / 2, window.innerHeight / 2, zoom * 1.15)}>
              <Plus />
            </Button>
            <div className="ml-2 flex -space-x-2">
              {activeParticipants.slice(0, 5).map((participant) => (
                <AvatarBadge
                  color={participant.color}
                  imageUrl={participant.avatarUrl}
                  key={participant.userId}
                  label={participant.name}
                />
              ))}
            </div>
            {canInviteToSession ? (
              <Button size="icon-sm" type="button" variant="ghost" onClick={() => setInviteModalOpen(true)}>
                <MailPlus />
              </Button>
            ) : null}
            <Button
              className="relative"
              onClick={() => setNotificationsOpen((value) => !value)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Bell className="size-4" />
              {inboxCount ? (
                <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[#ef4444]" />
              ) : null}
            </Button>
            {isOwner ? (
              <Button size="icon-sm" type="button" variant="ghost" onClick={() => setMembersModalOpen(true)}>
                <Settings />
              </Button>
            ) : null}
            <SignOutButton>
              <Button size="icon-sm" type="button" variant="ghost">
                <LogOut />
              </Button>
            </SignOutButton>
          </div>
        </header>

        <div
          className={cn(
            "relative min-h-0 flex-1 touch-none overflow-hidden bg-[#09090b] outline-none",
            spacePressed ? "cursor-grab active:cursor-grabbing" : "cursor-default",
          )}
          onKeyDown={(event) => {
            if ((event.key === "Delete" || event.key === "Backspace") && selectedNodeId) {
              event.preventDefault()
              void deleteNode(selectedNodeId)
            }
            if ((event.key === "Delete" || event.key === "Backspace") && selectedGroupId) {
              event.preventDefault()
              void ungroupNodes(selectedGroupId)
            }
          }}
          onPaste={handlePaste}
          onPointerDown={handleCanvasPointerDown}
          onPointerEnter={() => canvasRef.current?.focus({ preventScroll: true })}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onTouchEnd={handleCanvasTouchEnd}
          onTouchMove={handleCanvasTouchMove}
          onTouchStart={handleCanvasTouchStart}
          ref={canvasRef}
          tabIndex={0}
        >
          <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-md border border-[#27272a] bg-[#18181b]/95 p-1 shadow-sm">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => void addNode({ kind: "text", x: (220 - pan.x) / zoom, y: (140 - pan.y) / zoom, heading: "Untitled", text: "" })}
            >
              <Plus />
            </Button>
          </div>

          <div
            className="pointer-events-none absolute left-0 top-0 h-full w-full"
            style={{
              backgroundImage: "radial-gradient(circle, #3f3f46 1px, transparent 1px)",
              backgroundPosition: `${pan.x}px ${pan.y}px`,
              backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            }}
          />

          <div
            className="absolute left-0 top-0 h-px w-px origin-top-left"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            {groups.map((group) => (
              <GroupView
                key={group._id}
                group={group}
                disableDrag={spacePressed}
                onDrag={(x, y) => {
                  const dx = x - group.x
                  const dy = y - group.y
                  setDraftGroups((items) => ({ ...items, [group._id]: { x, y, width: group.width, height: group.height } }))
                  setDraftPositions((items) => ({
                    ...items,
                    ...Object.fromEntries(
                      nodes
                        .filter((node) => group.nodeIds.includes(node._id))
                        .map((node) => [node._id, { x: node.x + dx, y: node.y + dy }]),
                    ),
                  }))
                }}
                onDragEnd={(x, y) => void moveGroup(group, { x, y })}
                onNameChange={(name) => void updateGroupName(group._id, name)}
                onSelect={() => {
                  setSelectedGroupId(group._id)
                  setSelectedNodeId(undefined)
                  setSelectedNodeIds([])
                }}
                onUngroup={() => void ungroupNodes(group._id)}
                selected={selectedGroupId === group._id}
                zoom={zoom}
              />
            ))}
            {selectedBounds && selectedNodeIds.length > 1 ? (
              <form
                className="absolute z-40 flex items-center gap-1 rounded-md border border-[#27272a] bg-[#18181b]/95 p-1 shadow-lg backdrop-blur-md"
                style={{ left: selectedBounds.x + selectedBounds.width / 2 - 82, top: selectedBounds.y - 52 }}
                onSubmit={(event) => {
                  event.preventDefault()
                  void groupSelectedNodes()
                }}
              >
                <input
                  className="h-8 w-28 bg-transparent px-2 text-xs outline-none"
                  onChange={(event) => setGroupNameDraft(event.target.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  value={groupNameDraft}
                />
                <Button size="icon-sm" type="submit" variant="ghost">
                  <Group />
                </Button>
              </form>
            ) : null}
            {selectionBox ? (
              <div
                className="pointer-events-none absolute z-40 border border-dashed border-white/70 bg-white/5"
                style={{
                  left: Math.min(selectionBox.startX, selectionBox.x),
                  top: Math.min(selectionBox.startY, selectionBox.y),
                  width: Math.abs(selectionBox.x - selectionBox.startX),
                  height: Math.abs(selectionBox.y - selectionBox.startY),
                }}
              />
            ) : null}
            {nodes.map((node) => (
              <CanvasNodeView
                key={node._id}
                node={node}
                disableDrag={spacePressed || groupedNodeIds.has(node._id)}
                onCenter={() => centerNode(node._id)}
                onDelete={() => void deleteNode(node._id)}
                onDrag={(x, y) => setDraftPositions((items) => ({ ...items, [node._id]: { x, y } }))}
                onDragEnd={(x, y, previousX, previousY) => {
                  if (x === previousX && y === previousY) return
                  pushUndo(async () => {
                    if (isConvexConfigured && !node._id.startsWith("local")) {
                      await updateNode({ nodeId: nodeId(node._id), x: previousX, y: previousY, userId: currentUser.id })
                    } else {
                      setLocalNodes((items) =>
                        items.map((item) => (item._id === node._id ? { ...item, x: previousX, y: previousY } : item)),
                      )
                    }
                  })

                  if (isConvexConfigured && !node._id.startsWith("local")) {
                    void updateNode({ nodeId: nodeId(node._id), x, y, userId: currentUser.id })
                  } else {
                    setLocalNodes((items) =>
                      items.map((item) => (item._id === node._id ? { ...item, x, y } : item)),
                    )
                  }
                }}
                onHeadingChange={(heading) => void updateNodeHeading(node._id, heading)}
                onResize={(next) => setDraftPositions((items) => ({ ...items, [node._id]: next }))}
                onResizeEnd={(next, previous) => {
                  if (
                    next.x === previous.x &&
                    next.y === previous.y &&
                    next.width === previous.width &&
                    next.height === previous.height
                  ) {
                    return
                  }

                  pushUndo(async () => {
                    if (isConvexConfigured && !node._id.startsWith("local")) {
                      await updateNode({
                        nodeId: nodeId(node._id),
                        x: previous.x,
                        y: previous.y,
                        width: previous.width,
                        height: previous.height,
                        userId: currentUser.id,
                      })
                    } else {
                      setLocalNodes((items) =>
                        items.map((item) => (item._id === node._id ? { ...item, ...previous } : item)),
                      )
                    }
                  })

                  if (isConvexConfigured && !node._id.startsWith("local")) {
                    void updateNode({
                      nodeId: nodeId(node._id),
                      x: next.x,
                      y: next.y,
                      width: next.width,
                      height: next.height,
                      userId: currentUser.id,
                    })
                  } else {
                    setLocalNodes((items) =>
                      items.map((item) => (item._id === node._id ? { ...item, ...next } : item)),
                    )
                  }
                }}
                onSelect={(event) => {
                  setSelectedGroupId(undefined)
                  if (event.shiftKey && !groupedNodeIds.has(node._id)) {
                    setSelectedNodeId(undefined)
                    setSelectedNodeIds((items) =>
                      items.includes(node._id)
                        ? items.filter((item) => item !== node._id)
                        : [...items, node._id],
                    )
                    return
                  }

                  setSelectedNodeId(node._id)
                  setSelectedNodeIds([])
                }}
                onStartEdit={() => setSelectedNodeId(node._id)}
                onTextChange={(text) => void updateNodeText(node._id, text)}
                selected={selectedNodeId === node._id || selectedNodeIds.includes(node._id)}
                zoom={zoom}
              />
            ))}

            {presence
              .filter((item) => item.userId !== currentUser.id)
              .map((item) => (
                <div
                  className="pointer-events-none absolute z-30"
                  key={item._id}
                  style={{ left: item.cursorX, top: item.cursorY }}
                >
                  <MousePointer2 className="size-5 fill-white" style={{ color: item.color }} />
                  <span className="ml-4 inline-flex">
                    <AvatarBadge color={item.color} imageUrl={item.avatarUrl} label={item.name} />
                  </span>
                </div>
              ))}
          </div>
        </div>
      </section>

      <aside
        className={cn(
          "relative flex shrink-0 flex-col border-l border-[#27272a] bg-[#111113] transition-[width] duration-200 ease-out",
          chatCollapsed && "items-center",
        )}
        style={{ width: chatCollapsed ? 52 : chatWidth }}
      >
        {!chatCollapsed ? (
          <div
            className="absolute -left-1 top-0 z-30 flex h-full w-2 cursor-col-resize items-center justify-center"
            onPointerDown={(event) => {
              const startX = event.clientX
              const startWidth = chatWidth
              event.currentTarget.setPointerCapture(event.pointerId)

              function move(moveEvent: globalThis.PointerEvent) {
                setChatWidth(Math.min(560, Math.max(300, startWidth + startX - moveEvent.clientX)))
              }

              function up() {
                window.removeEventListener("pointermove", move)
                window.removeEventListener("pointerup", up)
              }

              window.addEventListener("pointermove", move)
              window.addEventListener("pointerup", up)
            }}
          >
            <GripVertical className="size-4 text-[#71717a]" />
          </div>
        ) : null}
        <div className="border-b border-[#27272a] p-3">
          <div className="flex justify-end">
            <Button
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={() => setChatCollapsed((value) => !value)}
            >
              <MessageSquare />
            </Button>
          </div>
        </div>

        {!chatCollapsed ? <div className="min-h-0 flex-1 animate-in fade-in-0 slide-in-from-right-2 space-y-3 overflow-y-auto p-4 duration-150 ease-out">
          {messages.map((message) => (
            <div className="rounded-md border border-[#27272a] bg-[#18181b] p-3" key={message._id}>
              <div className="mb-2 flex items-center gap-2">
                <Circle className="size-3 fill-[#2563eb] text-[#2563eb]" />
                <span className="text-sm font-medium">{message.userId === currentUser.id ? "You" : "Maya"}</span>
              </div>
              <p className="text-sm leading-6">{message.body}</p>
              {message.taggedNodeIds.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.taggedNodeIds.map((nodeId) => (
                    <button
                      className="inline-flex items-center gap-1 rounded-full border border-[#3f3f46] px-2 py-1 text-xs hover:border-[#71717a]"
                      key={nodeId}
                      onClick={() => centerNode(nodeId)}
                    >
                      <AtSign className="size-3" />
                      {tagLabel(nodeId)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div> : null}

        {!chatCollapsed ? <form className="animate-in fade-in-0 slide-in-from-right-2 border-t border-[#27272a] p-4 duration-150 ease-out" onSubmit={submitMessage}>
          {selectedNodeId || selectedGroupId ? (
            <button
              className="mb-2 inline-flex items-center gap-1 rounded-full border border-[#3f3f46] bg-[#18181b] px-2 py-1 text-xs"
              onClick={() => {
                const tagId = selectedGroupId ? `group:${selectedGroupId}` : selectedNodeId
                if (!tagId) return

                setTaggedNodeIds((items) =>
                  items.includes(tagId) ? items : [...items, tagId],
                )
              }}
              type="button"
            >
              <AtSign className="size-3" />
              Tag {selectedGroupId ? tagLabel(`group:${selectedGroupId}`) : tagLabel(selectedNodeId ?? "")}
            </button>
          ) : null}
          <textarea
            className="min-h-24 w-full resize-none rounded-md border border-[#27272a] bg-[#18181b] p-3 text-sm outline-none focus:border-[#52525b]"
            onChange={(event) => setChatBody(event.target.value)}
            placeholder="Discuss direction, tag nodes, assign next edits..."
            value={chatBody}
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex flex-wrap gap-1">
              {taggedNodeIds.map((nodeId) => (
                <button
                  className="inline-flex animate-in zoom-in-95 fade-in-0 items-center gap-1 rounded-full bg-[#27272a] px-2 py-1 text-xs duration-150 ease-out hover:bg-[#3f3f46]"
                  key={nodeId}
                  onClick={() => setTaggedNodeIds((items) => items.filter((item) => item !== nodeId))}
                  type="button"
                >
                  @{tagLabel(nodeId)}
                  <X className="size-3" />
                </button>
              ))}
            </div>
            <Button size="sm" type="submit">
              <Send />
              Send
            </Button>
          </div>
        </form> : null}
      </aside>
    </main>
  )
}

function GroupView({
  disableDrag,
  group,
  onDrag,
  onDragEnd,
  onNameChange,
  onSelect,
  onUngroup,
  selected,
  zoom,
}: {
  group: CanvasGroup
  disableDrag: boolean
  onDrag: (x: number, y: number) => void
  onDragEnd: (x: number, y: number) => void
  onNameChange: (name: string) => void
  onSelect: () => void
  onUngroup: () => void
  selected: boolean
  zoom: number
}) {
  const drag = useRef<{ startX: number; startY: number; groupX: number; groupY: number } | null>(null)

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disableDrag) return
    if ((event.target as HTMLElement).closest("[data-group-control='true']")) return

    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      groupX: group.x,
      groupY: group.y,
    }
    onSelect()
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    onDrag(
      drag.current.groupX + (event.clientX - drag.current.startX) / zoom,
      drag.current.groupY + (event.clientY - drag.current.startY) / zoom,
    )
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const x = drag.current.groupX + (event.clientX - drag.current.startX) / zoom
    const y = drag.current.groupY + (event.clientY - drag.current.startY) / zoom
    drag.current = null
    onDragEnd(x, y)
  }

  return (
    <div
      className={cn("group absolute z-0", selected && "z-10")}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      style={{ left: group.x, top: group.y, width: group.width, height: group.height }}
    >
      <div className="pointer-events-auto absolute -top-9 left-4 right-4 z-0 flex translate-y-3 items-center rounded-t-md border border-white/40 bg-[#18181b]/70 px-2 py-1 opacity-0 shadow-sm backdrop-blur-md transition group-hover:translate-y-0 group-hover:opacity-100">
        <input
          className="min-w-0 flex-1 bg-transparent text-xs font-medium text-[#f4f4f5] outline-none"
          data-group-control="true"
          defaultValue={groupHeading(group)}
          onBlur={(event) => onNameChange(event.currentTarget.value)}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        />
      </div>
      <div
        className={cn(
          "h-full rounded-lg border border-dashed border-white/70 bg-white/[0.02] transition",
          selected && "bg-white/[0.04]",
        )}
      />
      <button
        className="pointer-events-auto absolute -bottom-9 left-1/2 z-30 grid size-8 -translate-x-1/2 -translate-y-3 place-items-center rounded-md border border-[#3f3f46] bg-[#18181b]/90 text-[#a1a1aa] opacity-0 shadow-sm backdrop-blur-md transition group-hover:translate-y-0 group-hover:opacity-100 hover:border-[#71717a] hover:text-white"
        data-group-control="true"
        onClick={onUngroup}
        type="button"
      >
        <Ungroup className="size-4" />
      </button>
    </div>
  )
}

function CanvasNodeView(props: {
  node: CanvasNode
  disableDrag: boolean
  onCenter: () => void
  onDelete: () => void
  onDrag: (x: number, y: number) => void
  onDragEnd: (x: number, y: number, previousX: number, previousY: number) => void
  onHeadingChange: (heading: string) => void
  onResize: (box: NodeBox) => void
  onResizeEnd: (box: NodeBox, previous: NodeBox) => void
  onSelect: (event: PointerEvent<HTMLDivElement>) => void
  onStartEdit: () => void
  onTextChange: (text: string) => void
  selected: boolean
  zoom: number
}) {
  if (props.node.kind === "image" || props.node.kind === "image-loading") {
    return <ImageNode {...props} />
  }

  return <TextNode {...props} />
}

function NodeResizeHandles({
  node,
  onResize,
  onResizeEnd,
  zoom,
}: {
  node: CanvasNode
  onResize: (box: NodeBox) => void
  onResizeEnd: (box: NodeBox, previous: NodeBox) => void
  zoom: number
}) {
  const resize = useRef<{
    handle: ResizeHandle
    startX: number
    startY: number
    box: NodeBox
  } | null>(null)
  const handles: Array<{ handle: ResizeHandle; className: string }> = [
    { handle: "nw", className: "-left-1.5 -top-1.5 cursor-nwse-resize" },
    { handle: "n", className: "left-1/2 -top-1.5 -translate-x-1/2 cursor-ns-resize" },
    { handle: "ne", className: "-right-1.5 -top-1.5 cursor-nesw-resize" },
    { handle: "e", className: "-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize" },
    { handle: "se", className: "-bottom-1.5 -right-1.5 cursor-nwse-resize" },
    { handle: "s", className: "-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize" },
    { handle: "sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
    { handle: "w", className: "-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize" },
  ]

  function pointerDown(handle: ResizeHandle, event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    resize.current = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      box: { x: node.x, y: node.y, width: node.width, height: node.height },
    }
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!resize.current) return
    event.preventDefault()
    event.stopPropagation()
    onResize(
      resizeNodeBox(
        resize.current.box,
        resize.current.handle,
        (event.clientX - resize.current.startX) / zoom,
        (event.clientY - resize.current.startY) / zoom,
      ),
    )
  }

  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (!resize.current) return
    event.preventDefault()
    event.stopPropagation()
    const previous = resize.current.box
    const next = resizeNodeBox(
      previous,
      resize.current.handle,
      (event.clientX - resize.current.startX) / zoom,
      (event.clientY - resize.current.startY) / zoom,
    )
    resize.current = null
    onResizeEnd(next, previous)
  }

  return (
    <>
      {handles.map(({ handle, className }) => (
        <button
          className={cn(
            "absolute z-40 size-3 rounded-full border border-[#09090b] bg-[#e4e4e7] opacity-80 transition hover:scale-110 hover:opacity-100",
            className,
          )}
          data-node-control="true"
          key={handle}
          onPointerDown={(event) => pointerDown(handle, event)}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          type="button"
        />
      ))}
    </>
  )
}

function TextNode({
  disableDrag,
  node,
  onCenter,
  onDelete,
  onDrag,
  onDragEnd,
  onHeadingChange,
  onResize,
  onResizeEnd,
  onSelect,
  onStartEdit,
  onTextChange,
  selected,
  zoom,
}: {
  node: CanvasNode
  disableDrag: boolean
  onCenter: () => void
  onDelete: () => void
  onDrag: (x: number, y: number) => void
  onDragEnd: (x: number, y: number, previousX: number, previousY: number) => void
  onHeadingChange: (heading: string) => void
  onResize: (box: NodeBox) => void
  onResizeEnd: (box: NodeBox, previous: NodeBox) => void
  onSelect: (event: PointerEvent<HTMLDivElement>) => void
  onStartEdit: () => void
  onTextChange: (text: string) => void
  selected: boolean
  zoom: number
}) {
  const drag = useRef<{ startX: number; startY: number; nodeX: number; nodeY: number } | null>(null)
  const selectedClickRef = useRef(false)
  const movedRef = useRef(false)
  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState(node.text ?? "")

  useEffect(() => {
    setDraftText(node.text ?? "")
  }, [node.text])

  useEffect(() => {
    if (!selected) setEditing(false)
  }, [selected])

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-node-control='true']")) return
    selectedClickRef.current = selected
    movedRef.current = false
    onSelect(event)
    if (disableDrag || event.shiftKey) return

    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      nodeX: node.x,
      nodeY: node.y,
    }
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    if (Math.hypot(event.clientX - drag.current.startX, event.clientY - drag.current.startY) > 3) {
      movedRef.current = true
    }
    onDrag(
      drag.current.nodeX + (event.clientX - drag.current.startX) / zoom,
      drag.current.nodeY + (event.clientY - drag.current.startY) / zoom,
    )
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const previousX = drag.current.nodeX
    const previousY = drag.current.nodeY
    const x = drag.current.nodeX + (event.clientX - drag.current.startX) / zoom
    const y = drag.current.nodeY + (event.clientY - drag.current.startY) / zoom
    drag.current = null
    onDragEnd(x, y, previousX, previousY)
    if (selectedClickRef.current && !movedRef.current && !editing) {
      onStartEdit()
      setDraftText(node.text ?? "")
      setEditing(true)
    }
  }

  return (
    <div
      className={cn(
        "group absolute z-20 overflow-visible",
        selected && "z-30",
      )}
      onDoubleClick={onCenter}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
    >
      <div className="absolute -top-9 left-2 right-2 z-0 flex translate-y-3 items-center gap-2 rounded-t-md border border-[#3f3f46]/80 bg-[#18181b]/70 px-2 py-1 opacity-0 shadow-sm backdrop-blur-md transition group-hover:translate-y-0 group-hover:opacity-100">
        <input
          className="min-w-0 flex-1 bg-transparent text-xs font-medium text-[#f4f4f5] outline-none"
          defaultValue={nodeHeading(node)}
          onBlur={(event) => onHeadingChange(event.currentTarget.value)}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          data-node-control="true"
        />
        <button
          className="grid size-6 place-items-center rounded-md text-[#a1a1aa] hover:bg-[#27272a] hover:text-white"
          data-node-control="true"
          onClick={() => void copyToClipboard(node.text ?? nodeHeading(node))}
          type="button"
        >
          <Copy className="size-3.5" />
        </button>
        <button
          className="grid size-6 place-items-center rounded-md text-[#a1a1aa] hover:bg-[#3f1d1d] hover:text-[#fca5a5]"
          data-node-control="true"
          onClick={onDelete}
          type="button"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div
        className={cn(
          "relative z-10 h-full rounded-lg border bg-[#18181b]/60 p-3 shadow-sm backdrop-blur-md transition",
          selected ? "border-[#e4e4e7]" : "border-[#3f3f46]/70",
        )}
      >
        {editing ? (
          <textarea
            autoFocus
            className="hide-scrollbar h-full w-full resize-none overflow-y-auto overflow-x-hidden bg-transparent text-sm leading-6 text-[#e4e4e7] outline-none placeholder:text-[#71717a]"
            data-node-control="true"
            data-node-scroll="true"
            onBlur={() => {
              onTextChange(draftText)
              setEditing(false)
            }}
            onChange={(event) => setDraftText(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === "Escape") {
                setDraftText(node.text ?? "")
                setEditing(false)
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={scrollNodeContent}
            placeholder="Write here..."
            value={draftText}
          />
        ) : (
          <div
            className="hide-scrollbar h-full overflow-y-auto overflow-x-hidden break-words text-[#e4e4e7]"
            data-node-scroll="true"
            onDoubleClick={(event) => {
              event.stopPropagation()
              setDraftText(node.text ?? "")
              setEditing(true)
            }}
            onWheel={scrollNodeContent}
          >
            {node.text?.trim() ? renderMarkdown(node.text) : (
              <p className="text-sm leading-6 text-[#71717a]">Write here...</p>
            )}
          </div>
        )}
      </div>
      {selected ? (
        <NodeResizeHandles node={node} onResize={onResize} onResizeEnd={onResizeEnd} zoom={zoom} />
      ) : null}
    </div>
  )
}

function ImageNode({
  disableDrag,
  node,
  onCenter,
  onDelete,
  onDrag,
  onDragEnd,
  onHeadingChange,
  onResize,
  onResizeEnd,
  onSelect,
  selected,
  zoom,
}: {
  node: CanvasNode
  disableDrag: boolean
  onCenter: () => void
  onDelete: () => void
  onDrag: (x: number, y: number) => void
  onDragEnd: (x: number, y: number, previousX: number, previousY: number) => void
  onHeadingChange: (heading: string) => void
  onResize: (box: NodeBox) => void
  onResizeEnd: (box: NodeBox, previous: NodeBox) => void
  onSelect: (event: PointerEvent<HTMLDivElement>) => void
  onStartEdit: () => void
  selected: boolean
  zoom: number
}) {
  const drag = useRef<{ startX: number; startY: number; nodeX: number; nodeY: number } | null>(null)

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-node-control='true']")) return
    onSelect(event)
    if (disableDrag || event.shiftKey) return

    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      nodeX: node.x,
      nodeY: node.y,
    }
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    onDrag(
      drag.current.nodeX + (event.clientX - drag.current.startX) / zoom,
      drag.current.nodeY + (event.clientY - drag.current.startY) / zoom,
    )
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const previousX = drag.current.nodeX
    const previousY = drag.current.nodeY
    const x = drag.current.nodeX + (event.clientX - drag.current.startX) / zoom
    const y = drag.current.nodeY + (event.clientY - drag.current.startY) / zoom
    drag.current = null
    onDragEnd(x, y, previousX, previousY)
  }

  return (
    <div
      className={cn("group absolute z-20 overflow-visible", selected && "z-30")}
      onDoubleClick={onCenter}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
    >
      {node.kind !== "image-loading" ? (
        <div className="absolute -top-9 left-2 right-2 z-0 flex translate-y-3 items-center gap-2 rounded-t-md border border-[#3f3f46]/80 bg-[#18181b]/70 px-2 py-1 opacity-0 shadow-sm backdrop-blur-md transition group-hover:translate-y-0 group-hover:opacity-100">
          <input
            className="min-w-0 flex-1 bg-transparent text-xs font-medium text-[#f4f4f5] outline-none"
            data-node-control="true"
            defaultValue={nodeHeading(node)}
            onBlur={(event) => onHeadingChange(event.currentTarget.value)}
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          />
          <button
            className="grid size-6 place-items-center rounded-md text-[#a1a1aa] hover:bg-[#27272a] hover:text-white"
            data-node-control="true"
            onClick={() => void copyToClipboard(node.imageUrl ?? node.localImageUrl ?? nodeHeading(node))}
            type="button"
          >
            <Copy className="size-3.5" />
          </button>
          <button
            className="grid size-6 place-items-center rounded-md text-[#a1a1aa] hover:bg-[#3f1d1d] hover:text-[#fca5a5]"
            data-node-control="true"
            onClick={onDelete}
            type="button"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ) : null}
      {node.kind === "image-loading" ? (
        <div className="relative z-10 h-full w-full overflow-hidden rounded-md border border-[#3f3f46]/70 bg-[#18181b]/60 shadow-sm">
          <div className="absolute inset-0 animate-pulse bg-[#27272a]" />
          <div className="absolute inset-x-5 top-5 h-3 rounded-full bg-[#3f3f46]" />
          <div className="absolute bottom-5 left-5 right-14 h-3 rounded-full bg-[#3f3f46]/80" />
          <div className="absolute bottom-5 right-5 size-3 rounded-full bg-[#3f3f46]/80" />
        </div>
      ) : node.imageUrl || node.localImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={nodeHeading(node)}
          className={cn(
            "relative z-10 block max-w-none rounded-md object-cover shadow-sm",
            selected && "outline outline-2 outline-[#e4e4e7]",
          )}
          draggable={false}
          src={node.imageUrl ?? node.localImageUrl}
          style={{ width: node.width, height: node.height }}
        />
      ) : null}
      {selected && node.kind !== "image-loading" ? (
        <NodeResizeHandles node={node} onResize={onResize} onResizeEnd={onResizeEnd} zoom={zoom} />
      ) : null}
    </div>
  )
}

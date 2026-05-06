"use client"

import {
  AtSign,
  Bell,
  ChevronRight,
  Check,
  Circle,
  Clock3,
  Eye,
  Folder,
  GripVertical,
  ImagePlus,
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
  Type,
  UserMinus,
  X,
} from "lucide-react"
import { SignOutButton, useUser } from "@clerk/nextjs"
import { useMutation, useQuery } from "convex/react"
import {
  FormEvent,
  PointerEvent,
  TouchEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

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
  kind: "text" | "image" | "mixed"
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
  const [localMessages, setLocalMessages] = useState<Message[]>([])
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [selectedNodeId, setSelectedNodeId] = useState<string>()
  const [draftPositions, setDraftPositions] = useState<Record<string, { x: number; y: number }>>({})
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
      event.preventDefault()

      if (!event.ctrlKey) {
        setPan((value) => ({
          x: value.x - (event.shiftKey ? event.deltaY : event.deltaX),
          y: value.y - (event.shiftKey ? 0 : event.deltaY),
        }))
        return
      }

      const rect = targetCanvas.getBoundingClientRect()
      const direction = event.deltaY > 0 ? -1 : 1
      const nextZoom = clampZoom(zoom * (1 + direction * 0.12))
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

  const nodes = useMemo(() => {
    const source = liveNodes ?? localNodes
    return source.map((node) => ({ ...node, ...draftPositions[node._id] }))
  }, [draftPositions, liveNodes, localNodes])
  const messages = liveMessages ?? localMessages
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

  function handleCanvasPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (!spacePressed && event.target !== event.currentTarget)) return

    event.currentTarget.setPointerCapture(event.pointerId)
    panDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    }
  }

  function handleCanvasPointerUp() {
    panDragRef.current = null
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
    if (isConvexConfigured && !id.startsWith("local")) {
      await updateNode({ nodeId: nodeId(id), heading, userId: currentUser.id })
      return
    }

    setLocalNodes((items) =>
      items.map((item) => (item._id === id ? { ...item, heading } : item)),
    )
  }

  async function updateNodeText(id: string, text: string) {
    if (isConvexConfigured && !id.startsWith("local")) {
      await updateNode({ nodeId: nodeId(id), text, userId: currentUser.id })
      return
    }

    setLocalNodes((items) =>
      items.map((item) => (item._id === id ? { ...item, text } : item)),
    )
  }

  async function deleteNode(id: string) {
    if (isConvexConfigured && !id.startsWith("local")) {
      await deleteNodeMutation({ nodeId: nodeId(id), userId: currentUser.id })
    } else {
      setLocalNodes((items) => items.filter((item) => item._id !== id))
    }

    setSelectedNodeId((value) => (value === id ? undefined : value))
    setTaggedNodeIds((items) => items.filter((item) => item !== id))
  }

  async function addNode(input: Partial<CanvasNode> & Pick<CanvasNode, "kind" | "x" | "y">) {
    if (isConvexConfigured && currentSession && !currentSession._id.startsWith("local")) {
      await createNode({
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
      return
    }

    setLocalNodes((items) => [
      ...items,
      {
        _id: `local-node-${Date.now()}`,
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
  }

  async function addImageFile(file: File, x: number, y: number) {
    if (isConvexConfigured && currentSession && !currentSession._id.startsWith("local")) {
      const postUrl = await generateUploadUrl()
      const result = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      })
      const { storageId } = await result.json()
      await createNode({
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
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      void addNode({
        kind: "image",
        x,
        y,
        width: 320,
        height: 220,
        heading: file.name.replace(/\.[^.]+$/, "") || "Pasted image",
        localImageUrl: String(reader.result),
        imageUrl: String(reader.result),
      })
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
    const node = nodes.find((item) => item._id === nodeId)
    const canvas = canvasRef.current
    if (!node || !canvas) return

    setSelectedNodeId(nodeId)
    setPan({
      x: canvas.clientWidth / 2 - (node.x + node.width / 2) * zoom,
      y: canvas.clientHeight / 2 - (node.y + node.height / 2) * zoom,
    })
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
          <h1 className="text-lg font-semibold">Project Rooms</h1>
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
              <div className="p-1">
                {accountSessions.map((session) => (
                  <div
                    className={cn(
                      "group flex items-center gap-1 rounded-md px-2 py-1.5",
                      currentSession?._id === session._id ? "bg-[#27272a]" : "hover:bg-[#202024]",
                    )}
                    key={session._id}
                  >
                    <button className="shrink-0" onClick={() => setSelectedSessionId(session._id)} type="button">
                      <ChevronRight className="size-4 text-[#71717a]" />
                    </button>
                    <input
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      defaultValue={session.title}
                      onBlur={(event) => void renameSession(session, event.currentTarget.value)}
                      onFocus={() => setSelectedSessionId(session._id)}
                    />
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
          }}
          onPaste={handlePaste}
          onPointerDown={handleCanvasPointerDown}
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
              <Type />
            </Button>
            <Button size="icon-sm" variant="ghost">
              <ImagePlus />
            </Button>
            <Button size="icon-sm" variant="ghost">
              <MousePointer2 />
            </Button>
          </div>

          <div
            className="absolute left-0 top-0 h-full w-full"
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
            {nodes.map((node) => (
              <CanvasNodeView
                key={node._id}
                node={node}
                disableDrag={spacePressed}
                onCenter={() => centerNode(node._id)}
                onDelete={() => void deleteNode(node._id)}
                onDrag={(x, y) => setDraftPositions((items) => ({ ...items, [node._id]: { x, y } }))}
                onDragEnd={(x, y) => {
                  if (isConvexConfigured && !node._id.startsWith("local")) {
                    void updateNode({ nodeId: nodeId(node._id), x, y, userId: currentUser.id })
                  } else {
                    setLocalNodes((items) =>
                      items.map((item) => (item._id === node._id ? { ...item, x, y } : item)),
                    )
                  }
                }}
                onHeadingChange={(heading) => void updateNodeHeading(node._id, heading)}
                onSelect={() => setSelectedNodeId(node._id)}
                onTextChange={(text) => void updateNodeText(node._id, text)}
                selected={selectedNodeId === node._id}
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
                      {nodeHeading(nodes.find((node) => node._id === nodeId))}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div> : null}

        {!chatCollapsed ? <form className="animate-in fade-in-0 slide-in-from-right-2 border-t border-[#27272a] p-4 duration-150 ease-out" onSubmit={submitMessage}>
          {selectedNodeId ? (
            <button
              className="mb-2 inline-flex items-center gap-1 rounded-full border border-[#3f3f46] bg-[#18181b] px-2 py-1 text-xs"
              onClick={() =>
                setTaggedNodeIds((items) =>
                  items.includes(selectedNodeId) ? items : [...items, selectedNodeId],
                )
              }
              type="button"
            >
              <AtSign className="size-3" />
              Tag {nodeHeading(nodes.find((node) => node._id === selectedNodeId))}
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
                <span className="rounded-full bg-[#27272a] px-2 py-1 text-xs" key={nodeId}>
                  @{nodeHeading(nodes.find((node) => node._id === nodeId))}
                </span>
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

function CanvasNodeView(props: {
  node: CanvasNode
  disableDrag: boolean
  onCenter: () => void
  onDelete: () => void
  onDrag: (x: number, y: number) => void
  onDragEnd: (x: number, y: number) => void
  onHeadingChange: (heading: string) => void
  onSelect: () => void
  onTextChange: (text: string) => void
  selected: boolean
  zoom: number
}) {
  if (props.node.kind === "image") {
    return <ImageNode {...props} />
  }

  return <TextNode {...props} />
}

function TextNode({
  disableDrag,
  node,
  onCenter,
  onDelete,
  onDrag,
  onDragEnd,
  onHeadingChange,
  onSelect,
  onTextChange,
  selected,
  zoom,
}: {
  node: CanvasNode
  disableDrag: boolean
  onCenter: () => void
  onDelete: () => void
  onDrag: (x: number, y: number) => void
  onDragEnd: (x: number, y: number) => void
  onHeadingChange: (heading: string) => void
  onSelect: () => void
  onTextChange: (text: string) => void
  selected: boolean
  zoom: number
}) {
  const drag = useRef<{ startX: number; startY: number; nodeX: number; nodeY: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState(node.text ?? "")

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disableDrag) return
    if ((event.target as HTMLElement).closest("[data-node-control='true']")) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      nodeX: node.x,
      nodeY: node.y,
    }
    onSelect()
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
    const x = drag.current.nodeX + (event.clientX - drag.current.startX) / zoom
    const y = drag.current.nodeY + (event.clientY - drag.current.startY) / zoom
    drag.current = null
    onDragEnd(x, y)
  }

  return (
    <div
      className={cn(
        "group absolute overflow-visible",
        selected && "z-20",
      )}
      onDoubleClick={onCenter}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      style={{ left: node.x, top: node.y, width: node.width, minHeight: node.height }}
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
          "relative z-10 min-h-[inherit] rounded-lg border bg-[#18181b]/60 p-3 shadow-sm backdrop-blur-md transition",
          selected ? "border-[#e4e4e7]" : "border-[#3f3f46]/70",
        )}
      >
        {editing ? (
          <textarea
            autoFocus
            className="min-h-[inherit] w-full resize-none bg-transparent text-sm leading-6 text-[#e4e4e7] outline-none placeholder:text-[#71717a]"
            data-node-control="true"
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
            placeholder="Write here..."
            value={draftText}
          />
        ) : (
          <div
            className="min-h-[inherit] text-[#e4e4e7]"
            onDoubleClick={(event) => {
              event.stopPropagation()
              setDraftText(node.text ?? "")
              setEditing(true)
            }}
          >
            {node.text?.trim() ? renderMarkdown(node.text) : (
              <p className="text-sm leading-6 text-[#71717a]">Write here...</p>
            )}
          </div>
        )}
      </div>
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
  onSelect,
  selected,
  zoom,
}: {
  node: CanvasNode
  disableDrag: boolean
  onCenter: () => void
  onDelete: () => void
  onDrag: (x: number, y: number) => void
  onDragEnd: (x: number, y: number) => void
  onHeadingChange: (heading: string) => void
  onSelect: () => void
  selected: boolean
  zoom: number
}) {
  const drag = useRef<{ startX: number; startY: number; nodeX: number; nodeY: number } | null>(null)

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disableDrag) return
    if ((event.target as HTMLElement).closest("[data-node-control='true']")) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      nodeX: node.x,
      nodeY: node.y,
    }
    onSelect()
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
    const x = drag.current.nodeX + (event.clientX - drag.current.startX) / zoom
    const y = drag.current.nodeY + (event.clientY - drag.current.startY) / zoom
    drag.current = null
    onDragEnd(x, y)
  }

  return (
    <div
      className={cn("group absolute overflow-visible", selected && "z-20")}
      onDoubleClick={onCenter}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      style={{ left: node.x, top: node.y, width: node.width }}
    >
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
          className="grid size-6 place-items-center rounded-md text-[#a1a1aa] hover:bg-[#3f1d1d] hover:text-[#fca5a5]"
          data-node-control="true"
          onClick={onDelete}
          type="button"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {node.imageUrl || node.localImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={nodeHeading(node)}
          className={cn(
            "relative z-10 block max-w-none rounded-md shadow-sm",
            selected && "outline outline-2 outline-[#e4e4e7]",
          )}
          draggable={false}
          src={node.imageUrl ?? node.localImageUrl}
          style={{ width: node.width, height: "auto" }}
        />
      ) : null}
    </div>
  )
}

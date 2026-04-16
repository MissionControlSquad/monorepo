/* eslint-disable */
import type { Prisma, Activity, Agent, StatusHistory, WorkSession, AgentAction, AgentQueueItem, AdminUser, PasswordResetToken, Channel, ChannelMember, ChannelMessage, ChannelMessageAttachment, ChannelMessageMention, ChannelMessageReaction, CloudVM, CloudVMLog, CloudVMUsage, Deliverable, DeliverableVersion, Document, UsedNonce, LiveGatewayToken, LiveGatewayConnection, LiveAgentRoute, LivePendingDelivery, Message, MessageAttachment, MessageMention, MessageReaction, Notification, Subscription, UserNotification, PushSubscription, UserNotificationPreference, Project, ProjectMember, ProjectDoc, ProjectDocRevision, SystemSettings, License, FeatureFlag, Task, TaskAssignee, TaskTemplate, RecurringTask, RecurringTaskAssignee, User, Profile } from "@agentcenter/database";
import type { PothosPrismaDatamodel } from "@pothos/plugin-prisma";
export default interface PrismaTypes {
    Activity: {
        Name: "Activity";
        Shape: Activity;
        Include: Prisma.ActivityInclude;
        Select: Prisma.ActivitySelect;
        OrderBy: Prisma.ActivityOrderByWithRelationInput;
        WhereUnique: Prisma.ActivityWhereUniqueInput;
        Where: Prisma.ActivityWhereInput;
        Create: {};
        Update: {};
        RelationName: "profile" | "task" | "project";
        ListRelations: never;
        Relations: {
            profile: {
                Shape: Profile | null;
                Name: "Profile";
                Nullable: true;
            };
            task: {
                Shape: Task | null;
                Name: "Task";
                Nullable: true;
            };
            project: {
                Shape: Project | null;
                Name: "Project";
                Nullable: true;
            };
        };
    };
    Agent: {
        Name: "Agent";
        Shape: Agent;
        Include: Prisma.AgentInclude;
        Select: Prisma.AgentSelect;
        OrderBy: Prisma.AgentOrderByWithRelationInput;
        WhereUnique: Prisma.AgentWhereUniqueInput;
        Where: Prisma.AgentWhereInput;
        Create: {};
        Update: {};
        RelationName: "currentTaskRef" | "documents" | "notifications" | "subscriptions" | "workSessions" | "statusHistory" | "agentActions" | "queueItems" | "projectDocsAdded" | "projectDocRevisions" | "profile" | "cloudVm";
        ListRelations: "documents" | "notifications" | "subscriptions" | "workSessions" | "statusHistory" | "agentActions" | "queueItems" | "projectDocsAdded" | "projectDocRevisions";
        Relations: {
            currentTaskRef: {
                Shape: Task | null;
                Name: "Task";
                Nullable: true;
            };
            documents: {
                Shape: Document[];
                Name: "Document";
                Nullable: false;
            };
            notifications: {
                Shape: Notification[];
                Name: "Notification";
                Nullable: false;
            };
            subscriptions: {
                Shape: Subscription[];
                Name: "Subscription";
                Nullable: false;
            };
            workSessions: {
                Shape: WorkSession[];
                Name: "WorkSession";
                Nullable: false;
            };
            statusHistory: {
                Shape: StatusHistory[];
                Name: "StatusHistory";
                Nullable: false;
            };
            agentActions: {
                Shape: AgentAction[];
                Name: "AgentAction";
                Nullable: false;
            };
            queueItems: {
                Shape: AgentQueueItem[];
                Name: "AgentQueueItem";
                Nullable: false;
            };
            projectDocsAdded: {
                Shape: ProjectDoc[];
                Name: "ProjectDoc";
                Nullable: false;
            };
            projectDocRevisions: {
                Shape: ProjectDocRevision[];
                Name: "ProjectDocRevision";
                Nullable: false;
            };
            profile: {
                Shape: Profile | null;
                Name: "Profile";
                Nullable: true;
            };
            cloudVm: {
                Shape: CloudVM | null;
                Name: "CloudVM";
                Nullable: true;
            };
        };
    };
    StatusHistory: {
        Name: "StatusHistory";
        Shape: StatusHistory;
        Include: Prisma.StatusHistoryInclude;
        Select: Prisma.StatusHistorySelect;
        OrderBy: Prisma.StatusHistoryOrderByWithRelationInput;
        WhereUnique: Prisma.StatusHistoryWhereUniqueInput;
        Where: Prisma.StatusHistoryWhereInput;
        Create: {};
        Update: {};
        RelationName: "agent";
        ListRelations: never;
        Relations: {
            agent: {
                Shape: Agent;
                Name: "Agent";
                Nullable: false;
            };
        };
    };
    WorkSession: {
        Name: "WorkSession";
        Shape: WorkSession;
        Include: Prisma.WorkSessionInclude;
        Select: Prisma.WorkSessionSelect;
        OrderBy: Prisma.WorkSessionOrderByWithRelationInput;
        WhereUnique: Prisma.WorkSessionWhereUniqueInput;
        Where: Prisma.WorkSessionWhereInput;
        Create: {};
        Update: {};
        RelationName: "task" | "agent" | "project";
        ListRelations: never;
        Relations: {
            task: {
                Shape: Task;
                Name: "Task";
                Nullable: false;
            };
            agent: {
                Shape: Agent;
                Name: "Agent";
                Nullable: false;
            };
            project: {
                Shape: Project | null;
                Name: "Project";
                Nullable: true;
            };
        };
    };
    AgentAction: {
        Name: "AgentAction";
        Shape: AgentAction;
        Include: Prisma.AgentActionInclude;
        Select: Prisma.AgentActionSelect;
        OrderBy: Prisma.AgentActionOrderByWithRelationInput;
        WhereUnique: Prisma.AgentActionWhereUniqueInput;
        Where: Prisma.AgentActionWhereInput;
        Create: {};
        Update: {};
        RelationName: "agent" | "task" | "project";
        ListRelations: never;
        Relations: {
            agent: {
                Shape: Agent;
                Name: "Agent";
                Nullable: false;
            };
            task: {
                Shape: Task | null;
                Name: "Task";
                Nullable: true;
            };
            project: {
                Shape: Project | null;
                Name: "Project";
                Nullable: true;
            };
        };
    };
    AgentQueueItem: {
        Name: "AgentQueueItem";
        Shape: AgentQueueItem;
        Include: Prisma.AgentQueueItemInclude;
        Select: Prisma.AgentQueueItemSelect;
        OrderBy: Prisma.AgentQueueItemOrderByWithRelationInput;
        WhereUnique: Prisma.AgentQueueItemWhereUniqueInput;
        Where: Prisma.AgentQueueItemWhereInput;
        Create: {};
        Update: {};
        RelationName: "agent" | "relatedTask" | "project" | "parentQueueItem" | "childQueueItems";
        ListRelations: "childQueueItems";
        Relations: {
            agent: {
                Shape: Agent;
                Name: "Agent";
                Nullable: false;
            };
            relatedTask: {
                Shape: Task | null;
                Name: "Task";
                Nullable: true;
            };
            project: {
                Shape: Project | null;
                Name: "Project";
                Nullable: true;
            };
            parentQueueItem: {
                Shape: AgentQueueItem | null;
                Name: "AgentQueueItem";
                Nullable: true;
            };
            childQueueItems: {
                Shape: AgentQueueItem[];
                Name: "AgentQueueItem";
                Nullable: false;
            };
        };
    };
    AdminUser: {
        Name: "AdminUser";
        Shape: AdminUser;
        Include: Prisma.AdminUserInclude;
        Select: Prisma.AdminUserSelect;
        OrderBy: Prisma.AdminUserOrderByWithRelationInput;
        WhereUnique: Prisma.AdminUserWhereUniqueInput;
        Where: Prisma.AdminUserWhereInput;
        Create: {};
        Update: {};
        RelationName: "user" | "resetTokensReceived" | "resetTokensCreated";
        ListRelations: "resetTokensReceived" | "resetTokensCreated";
        Relations: {
            user: {
                Shape: User | null;
                Name: "User";
                Nullable: true;
            };
            resetTokensReceived: {
                Shape: PasswordResetToken[];
                Name: "PasswordResetToken";
                Nullable: false;
            };
            resetTokensCreated: {
                Shape: PasswordResetToken[];
                Name: "PasswordResetToken";
                Nullable: false;
            };
        };
    };
    PasswordResetToken: {
        Name: "PasswordResetToken";
        Shape: PasswordResetToken;
        Include: Prisma.PasswordResetTokenInclude;
        Select: Prisma.PasswordResetTokenSelect;
        OrderBy: Prisma.PasswordResetTokenOrderByWithRelationInput;
        WhereUnique: Prisma.PasswordResetTokenWhereUniqueInput;
        Where: Prisma.PasswordResetTokenWhereInput;
        Create: {};
        Update: {};
        RelationName: "adminUser" | "createdBy";
        ListRelations: never;
        Relations: {
            adminUser: {
                Shape: AdminUser;
                Name: "AdminUser";
                Nullable: false;
            };
            createdBy: {
                Shape: AdminUser;
                Name: "AdminUser";
                Nullable: false;
            };
        };
    };
    Channel: {
        Name: "Channel";
        Shape: Channel;
        Include: Prisma.ChannelInclude;
        Select: Prisma.ChannelSelect;
        OrderBy: Prisma.ChannelOrderByWithRelationInput;
        WhereUnique: Prisma.ChannelWhereUniqueInput;
        Where: Prisma.ChannelWhereInput;
        Create: {};
        Update: {};
        RelationName: "createdByProfile" | "project" | "members" | "messages";
        ListRelations: "members" | "messages";
        Relations: {
            createdByProfile: {
                Shape: Profile;
                Name: "Profile";
                Nullable: false;
            };
            project: {
                Shape: Project | null;
                Name: "Project";
                Nullable: true;
            };
            members: {
                Shape: ChannelMember[];
                Name: "ChannelMember";
                Nullable: false;
            };
            messages: {
                Shape: ChannelMessage[];
                Name: "ChannelMessage";
                Nullable: false;
            };
        };
    };
    ChannelMember: {
        Name: "ChannelMember";
        Shape: ChannelMember;
        Include: Prisma.ChannelMemberInclude;
        Select: Prisma.ChannelMemberSelect;
        OrderBy: Prisma.ChannelMemberOrderByWithRelationInput;
        WhereUnique: Prisma.ChannelMemberWhereUniqueInput;
        Where: Prisma.ChannelMemberWhereInput;
        Create: {};
        Update: {};
        RelationName: "channel" | "profile";
        ListRelations: never;
        Relations: {
            channel: {
                Shape: Channel;
                Name: "Channel";
                Nullable: false;
            };
            profile: {
                Shape: Profile;
                Name: "Profile";
                Nullable: false;
            };
        };
    };
    ChannelMessage: {
        Name: "ChannelMessage";
        Shape: ChannelMessage;
        Include: Prisma.ChannelMessageInclude;
        Select: Prisma.ChannelMessageSelect;
        OrderBy: Prisma.ChannelMessageOrderByWithRelationInput;
        WhereUnique: Prisma.ChannelMessageWhereUniqueInput;
        Where: Prisma.ChannelMessageWhereInput;
        Create: {};
        Update: {};
        RelationName: "channel" | "fromProfile" | "pinnedByProfile" | "attachments" | "mentions" | "reactions";
        ListRelations: "attachments" | "mentions" | "reactions";
        Relations: {
            channel: {
                Shape: Channel;
                Name: "Channel";
                Nullable: false;
            };
            fromProfile: {
                Shape: Profile;
                Name: "Profile";
                Nullable: false;
            };
            pinnedByProfile: {
                Shape: Profile | null;
                Name: "Profile";
                Nullable: true;
            };
            attachments: {
                Shape: ChannelMessageAttachment[];
                Name: "ChannelMessageAttachment";
                Nullable: false;
            };
            mentions: {
                Shape: ChannelMessageMention[];
                Name: "ChannelMessageMention";
                Nullable: false;
            };
            reactions: {
                Shape: ChannelMessageReaction[];
                Name: "ChannelMessageReaction";
                Nullable: false;
            };
        };
    };
    ChannelMessageAttachment: {
        Name: "ChannelMessageAttachment";
        Shape: ChannelMessageAttachment;
        Include: Prisma.ChannelMessageAttachmentInclude;
        Select: Prisma.ChannelMessageAttachmentSelect;
        OrderBy: Prisma.ChannelMessageAttachmentOrderByWithRelationInput;
        WhereUnique: Prisma.ChannelMessageAttachmentWhereUniqueInput;
        Where: Prisma.ChannelMessageAttachmentWhereInput;
        Create: {};
        Update: {};
        RelationName: "message" | "document";
        ListRelations: never;
        Relations: {
            message: {
                Shape: ChannelMessage;
                Name: "ChannelMessage";
                Nullable: false;
            };
            document: {
                Shape: Document;
                Name: "Document";
                Nullable: false;
            };
        };
    };
    ChannelMessageMention: {
        Name: "ChannelMessageMention";
        Shape: ChannelMessageMention;
        Include: Prisma.ChannelMessageMentionInclude;
        Select: Prisma.ChannelMessageMentionSelect;
        OrderBy: Prisma.ChannelMessageMentionOrderByWithRelationInput;
        WhereUnique: Prisma.ChannelMessageMentionWhereUniqueInput;
        Where: Prisma.ChannelMessageMentionWhereInput;
        Create: {};
        Update: {};
        RelationName: "message" | "profile";
        ListRelations: never;
        Relations: {
            message: {
                Shape: ChannelMessage;
                Name: "ChannelMessage";
                Nullable: false;
            };
            profile: {
                Shape: Profile;
                Name: "Profile";
                Nullable: false;
            };
        };
    };
    ChannelMessageReaction: {
        Name: "ChannelMessageReaction";
        Shape: ChannelMessageReaction;
        Include: Prisma.ChannelMessageReactionInclude;
        Select: Prisma.ChannelMessageReactionSelect;
        OrderBy: Prisma.ChannelMessageReactionOrderByWithRelationInput;
        WhereUnique: Prisma.ChannelMessageReactionWhereUniqueInput;
        Where: Prisma.ChannelMessageReactionWhereInput;
        Create: {};
        Update: {};
        RelationName: "message" | "profile";
        ListRelations: never;
        Relations: {
            message: {
                Shape: ChannelMessage;
                Name: "ChannelMessage";
                Nullable: false;
            };
            profile: {
                Shape: Profile;
                Name: "Profile";
                Nullable: false;
            };
        };
    };
    CloudVM: {
        Name: "CloudVM";
        Shape: CloudVM;
        Include: Prisma.CloudVMInclude;
        Select: Prisma.CloudVMSelect;
        OrderBy: Prisma.CloudVMOrderByWithRelationInput;
        WhereUnique: Prisma.CloudVMWhereUniqueInput;
        Where: Prisma.CloudVMWhereInput;
        Create: {};
        Update: {};
        RelationName: "agents" | "logs" | "usageRecords";
        ListRelations: "agents" | "logs" | "usageRecords";
        Relations: {
            agents: {
                Shape: Agent[];
                Name: "Agent";
                Nullable: false;
            };
            logs: {
                Shape: CloudVMLog[];
                Name: "CloudVMLog";
                Nullable: false;
            };
            usageRecords: {
                Shape: CloudVMUsage[];
                Name: "CloudVMUsage";
                Nullable: false;
            };
        };
    };
    CloudVMLog: {
        Name: "CloudVMLog";
        Shape: CloudVMLog;
        Include: Prisma.CloudVMLogInclude;
        Select: Prisma.CloudVMLogSelect;
        OrderBy: Prisma.CloudVMLogOrderByWithRelationInput;
        WhereUnique: Prisma.CloudVMLogWhereUniqueInput;
        Where: Prisma.CloudVMLogWhereInput;
        Create: {};
        Update: {};
        RelationName: "vm";
        ListRelations: never;
        Relations: {
            vm: {
                Shape: CloudVM;
                Name: "CloudVM";
                Nullable: false;
            };
        };
    };
    CloudVMUsage: {
        Name: "CloudVMUsage";
        Shape: CloudVMUsage;
        Include: Prisma.CloudVMUsageInclude;
        Select: Prisma.CloudVMUsageSelect;
        OrderBy: Prisma.CloudVMUsageOrderByWithRelationInput;
        WhereUnique: Prisma.CloudVMUsageWhereUniqueInput;
        Where: Prisma.CloudVMUsageWhereInput;
        Create: {};
        Update: {};
        RelationName: "vm";
        ListRelations: never;
        Relations: {
            vm: {
                Shape: CloudVM;
                Name: "CloudVM";
                Nullable: false;
            };
        };
    };
    Deliverable: {
        Name: "Deliverable";
        Shape: Deliverable;
        Include: Prisma.DeliverableInclude;
        Select: Prisma.DeliverableSelect;
        OrderBy: Prisma.DeliverableOrderByWithRelationInput;
        WhereUnique: Prisma.DeliverableWhereUniqueInput;
        Where: Prisma.DeliverableWhereInput;
        Create: {};
        Update: {};
        RelationName: "task" | "profile" | "project" | "versions";
        ListRelations: "versions";
        Relations: {
            task: {
                Shape: Task;
                Name: "Task";
                Nullable: false;
            };
            profile: {
                Shape: Profile;
                Name: "Profile";
                Nullable: false;
            };
            project: {
                Shape: Project | null;
                Name: "Project";
                Nullable: true;
            };
            versions: {
                Shape: DeliverableVersion[];
                Name: "DeliverableVersion";
                Nullable: false;
            };
        };
    };
    DeliverableVersion: {
        Name: "DeliverableVersion";
        Shape: DeliverableVersion;
        Include: Prisma.DeliverableVersionInclude;
        Select: Prisma.DeliverableVersionSelect;
        OrderBy: Prisma.DeliverableVersionOrderByWithRelationInput;
        WhereUnique: Prisma.DeliverableVersionWhereUniqueInput;
        Where: Prisma.DeliverableVersionWhereInput;
        Create: {};
        Update: {};
        RelationName: "deliverable" | "editedByProfile";
        ListRelations: never;
        Relations: {
            deliverable: {
                Shape: Deliverable;
                Name: "Deliverable";
                Nullable: false;
            };
            editedByProfile: {
                Shape: Profile | null;
                Name: "Profile";
                Nullable: true;
            };
        };
    };
    Document: {
        Name: "Document";
        Shape: Document;
        Include: Prisma.DocumentInclude;
        Select: Prisma.DocumentSelect;
        OrderBy: Prisma.DocumentOrderByWithRelationInput;
        WhereUnique: Prisma.DocumentWhereUniqueInput;
        Where: Prisma.DocumentWhereInput;
        Create: {};
        Update: {};
        RelationName: "createdBy" | "createdByProfile" | "task" | "project" | "messageAttachments" | "channelMessageAttachments";
        ListRelations: "messageAttachments" | "channelMessageAttachments";
        Relations: {
            createdBy: {
                Shape: Agent | null;
                Name: "Agent";
                Nullable: true;
            };
            createdByProfile: {
                Shape: Profile | null;
                Name: "Profile";
                Nullable: true;
            };
            task: {
                Shape: Task | null;
                Name: "Task";
                Nullable: true;
            };
            project: {
                Shape: Project | null;
                Name: "Project";
                Nullable: true;
            };
            messageAttachments: {
                Shape: MessageAttachment[];
                Name: "MessageAttachment";
                Nullable: false;
            };
            channelMessageAttachments: {
                Shape: ChannelMessageAttachment[];
                Name: "ChannelMessageAttachment";
                Nullable: false;
            };
        };
    };
    UsedNonce: {
        Name: "UsedNonce";
        Shape: UsedNonce;
        Include: never;
        Select: Prisma.UsedNonceSelect;
        OrderBy: Prisma.UsedNonceOrderByWithRelationInput;
        WhereUnique: Prisma.UsedNonceWhereUniqueInput;
        Where: Prisma.UsedNonceWhereInput;
        Create: {};
        Update: {};
        RelationName: never;
        ListRelations: never;
        Relations: {};
    };
    LiveGatewayToken: {
        Name: "LiveGatewayToken";
        Shape: LiveGatewayToken;
        Include: never;
        Select: Prisma.LiveGatewayTokenSelect;
        OrderBy: Prisma.LiveGatewayTokenOrderByWithRelationInput;
        WhereUnique: Prisma.LiveGatewayTokenWhereUniqueInput;
        Where: Prisma.LiveGatewayTokenWhereInput;
        Create: {};
        Update: {};
        RelationName: never;
        ListRelations: never;
        Relations: {};
    };
    LiveGatewayConnection: {
        Name: "LiveGatewayConnection";
        Shape: LiveGatewayConnection;
        Include: Prisma.LiveGatewayConnectionInclude;
        Select: Prisma.LiveGatewayConnectionSelect;
        OrderBy: Prisma.LiveGatewayConnectionOrderByWithRelationInput;
        WhereUnique: Prisma.LiveGatewayConnectionWhereUniqueInput;
        Where: Prisma.LiveGatewayConnectionWhereInput;
        Create: {};
        Update: {};
        RelationName: "agentRoutes" | "pendingDeliveries";
        ListRelations: "agentRoutes" | "pendingDeliveries";
        Relations: {
            agentRoutes: {
                Shape: LiveAgentRoute[];
                Name: "LiveAgentRoute";
                Nullable: false;
            };
            pendingDeliveries: {
                Shape: LivePendingDelivery[];
                Name: "LivePendingDelivery";
                Nullable: false;
            };
        };
    };
    LiveAgentRoute: {
        Name: "LiveAgentRoute";
        Shape: LiveAgentRoute;
        Include: Prisma.LiveAgentRouteInclude;
        Select: Prisma.LiveAgentRouteSelect;
        OrderBy: Prisma.LiveAgentRouteOrderByWithRelationInput;
        WhereUnique: Prisma.LiveAgentRouteWhereUniqueInput;
        Where: Prisma.LiveAgentRouteWhereInput;
        Create: {};
        Update: {};
        RelationName: "connection";
        ListRelations: never;
        Relations: {
            connection: {
                Shape: LiveGatewayConnection;
                Name: "LiveGatewayConnection";
                Nullable: false;
            };
        };
    };
    LivePendingDelivery: {
        Name: "LivePendingDelivery";
        Shape: LivePendingDelivery;
        Include: Prisma.LivePendingDeliveryInclude;
        Select: Prisma.LivePendingDeliverySelect;
        OrderBy: Prisma.LivePendingDeliveryOrderByWithRelationInput;
        WhereUnique: Prisma.LivePendingDeliveryWhereUniqueInput;
        Where: Prisma.LivePendingDeliveryWhereInput;
        Create: {};
        Update: {};
        RelationName: "connection";
        ListRelations: never;
        Relations: {
            connection: {
                Shape: LiveGatewayConnection;
                Name: "LiveGatewayConnection";
                Nullable: false;
            };
        };
    };
    Message: {
        Name: "Message";
        Shape: Message;
        Include: Prisma.MessageInclude;
        Select: Prisma.MessageSelect;
        OrderBy: Prisma.MessageOrderByWithRelationInput;
        WhereUnique: Prisma.MessageWhereUniqueInput;
        Where: Prisma.MessageWhereInput;
        Create: {};
        Update: {};
        RelationName: "task" | "fromProfile" | "project" | "attachments" | "mentions" | "reactions" | "notifications" | "userNotifications";
        ListRelations: "attachments" | "mentions" | "reactions" | "notifications" | "userNotifications";
        Relations: {
            task: {
                Shape: Task;
                Name: "Task";
                Nullable: false;
            };
            fromProfile: {
                Shape: Profile;
                Name: "Profile";
                Nullable: false;
            };
            project: {
                Shape: Project | null;
                Name: "Project";
                Nullable: true;
            };
            attachments: {
                Shape: MessageAttachment[];
                Name: "MessageAttachment";
                Nullable: false;
            };
            mentions: {
                Shape: MessageMention[];
                Name: "MessageMention";
                Nullable: false;
            };
            reactions: {
                Shape: MessageReaction[];
                Name: "MessageReaction";
                Nullable: false;
            };
            notifications: {
                Shape: Notification[];
                Name: "Notification";
                Nullable: false;
            };
            userNotifications: {
                Shape: UserNotification[];
                Name: "UserNotification";
                Nullable: false;
            };
        };
    };
    MessageAttachment: {
        Name: "MessageAttachment";
        Shape: MessageAttachment;
        Include: Prisma.MessageAttachmentInclude;
        Select: Prisma.MessageAttachmentSelect;
        OrderBy: Prisma.MessageAttachmentOrderByWithRelationInput;
        WhereUnique: Prisma.MessageAttachmentWhereUniqueInput;
        Where: Prisma.MessageAttachmentWhereInput;
        Create: {};
        Update: {};
        RelationName: "message" | "document";
        ListRelations: never;
        Relations: {
            message: {
                Shape: Message;
                Name: "Message";
                Nullable: false;
            };
            document: {
                Shape: Document;
                Name: "Document";
                Nullable: false;
            };
        };
    };
    MessageMention: {
        Name: "MessageMention";
        Shape: MessageMention;
        Include: Prisma.MessageMentionInclude;
        Select: Prisma.MessageMentionSelect;
        OrderBy: Prisma.MessageMentionOrderByWithRelationInput;
        WhereUnique: Prisma.MessageMentionWhereUniqueInput;
        Where: Prisma.MessageMentionWhereInput;
        Create: {};
        Update: {};
        RelationName: "message" | "profile";
        ListRelations: never;
        Relations: {
            message: {
                Shape: Message;
                Name: "Message";
                Nullable: false;
            };
            profile: {
                Shape: Profile;
                Name: "Profile";
                Nullable: false;
            };
        };
    };
    MessageReaction: {
        Name: "MessageReaction";
        Shape: MessageReaction;
        Include: Prisma.MessageReactionInclude;
        Select: Prisma.MessageReactionSelect;
        OrderBy: Prisma.MessageReactionOrderByWithRelationInput;
        WhereUnique: Prisma.MessageReactionWhereUniqueInput;
        Where: Prisma.MessageReactionWhereInput;
        Create: {};
        Update: {};
        RelationName: "message" | "profile";
        ListRelations: never;
        Relations: {
            message: {
                Shape: Message;
                Name: "Message";
                Nullable: false;
            };
            profile: {
                Shape: Profile;
                Name: "Profile";
                Nullable: false;
            };
        };
    };
    Notification: {
        Name: "Notification";
        Shape: Notification;
        Include: Prisma.NotificationInclude;
        Select: Prisma.NotificationSelect;
        OrderBy: Prisma.NotificationOrderByWithRelationInput;
        WhereUnique: Prisma.NotificationWhereUniqueInput;
        Where: Prisma.NotificationWhereInput;
        Create: {};
        Update: {};
        RelationName: "mentionedAgent" | "task" | "message";
        ListRelations: never;
        Relations: {
            mentionedAgent: {
                Shape: Agent;
                Name: "Agent";
                Nullable: false;
            };
            task: {
                Shape: Task | null;
                Name: "Task";
                Nullable: true;
            };
            message: {
                Shape: Message | null;
                Name: "Message";
                Nullable: true;
            };
        };
    };
    Subscription: {
        Name: "Subscription";
        Shape: Subscription;
        Include: Prisma.SubscriptionInclude;
        Select: Prisma.SubscriptionSelect;
        OrderBy: Prisma.SubscriptionOrderByWithRelationInput;
        WhereUnique: Prisma.SubscriptionWhereUniqueInput;
        Where: Prisma.SubscriptionWhereInput;
        Create: {};
        Update: {};
        RelationName: "agent" | "task";
        ListRelations: never;
        Relations: {
            agent: {
                Shape: Agent;
                Name: "Agent";
                Nullable: false;
            };
            task: {
                Shape: Task;
                Name: "Task";
                Nullable: false;
            };
        };
    };
    UserNotification: {
        Name: "UserNotification";
        Shape: UserNotification;
        Include: Prisma.UserNotificationInclude;
        Select: Prisma.UserNotificationSelect;
        OrderBy: Prisma.UserNotificationOrderByWithRelationInput;
        WhereUnique: Prisma.UserNotificationWhereUniqueInput;
        Where: Prisma.UserNotificationWhereInput;
        Create: {};
        Update: {};
        RelationName: "user" | "task" | "message";
        ListRelations: never;
        Relations: {
            user: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
            task: {
                Shape: Task | null;
                Name: "Task";
                Nullable: true;
            };
            message: {
                Shape: Message | null;
                Name: "Message";
                Nullable: true;
            };
        };
    };
    PushSubscription: {
        Name: "PushSubscription";
        Shape: PushSubscription;
        Include: Prisma.PushSubscriptionInclude;
        Select: Prisma.PushSubscriptionSelect;
        OrderBy: Prisma.PushSubscriptionOrderByWithRelationInput;
        WhereUnique: Prisma.PushSubscriptionWhereUniqueInput;
        Where: Prisma.PushSubscriptionWhereInput;
        Create: {};
        Update: {};
        RelationName: "user";
        ListRelations: never;
        Relations: {
            user: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
        };
    };
    UserNotificationPreference: {
        Name: "UserNotificationPreference";
        Shape: UserNotificationPreference;
        Include: Prisma.UserNotificationPreferenceInclude;
        Select: Prisma.UserNotificationPreferenceSelect;
        OrderBy: Prisma.UserNotificationPreferenceOrderByWithRelationInput;
        WhereUnique: Prisma.UserNotificationPreferenceWhereUniqueInput;
        Where: Prisma.UserNotificationPreferenceWhereInput;
        Create: {};
        Update: {};
        RelationName: "user";
        ListRelations: never;
        Relations: {
            user: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
        };
    };
    Project: {
        Name: "Project";
        Shape: Project;
        Include: Prisma.ProjectInclude;
        Select: Prisma.ProjectSelect;
        OrderBy: Prisma.ProjectOrderByWithRelationInput;
        WhereUnique: Prisma.ProjectWhereUniqueInput;
        Where: Prisma.ProjectWhereInput;
        Create: {};
        Update: {};
        RelationName: "members" | "tasks" | "projectDocs" | "activities" | "messages" | "documents" | "workSessions" | "agentActions" | "deliverables" | "queueItems" | "channels" | "recurringTasks";
        ListRelations: "members" | "tasks" | "projectDocs" | "activities" | "messages" | "documents" | "workSessions" | "agentActions" | "deliverables" | "queueItems" | "channels" | "recurringTasks";
        Relations: {
            members: {
                Shape: ProjectMember[];
                Name: "ProjectMember";
                Nullable: false;
            };
            tasks: {
                Shape: Task[];
                Name: "Task";
                Nullable: false;
            };
            projectDocs: {
                Shape: ProjectDoc[];
                Name: "ProjectDoc";
                Nullable: false;
            };
            activities: {
                Shape: Activity[];
                Name: "Activity";
                Nullable: false;
            };
            messages: {
                Shape: Message[];
                Name: "Message";
                Nullable: false;
            };
            documents: {
                Shape: Document[];
                Name: "Document";
                Nullable: false;
            };
            workSessions: {
                Shape: WorkSession[];
                Name: "WorkSession";
                Nullable: false;
            };
            agentActions: {
                Shape: AgentAction[];
                Name: "AgentAction";
                Nullable: false;
            };
            deliverables: {
                Shape: Deliverable[];
                Name: "Deliverable";
                Nullable: false;
            };
            queueItems: {
                Shape: AgentQueueItem[];
                Name: "AgentQueueItem";
                Nullable: false;
            };
            channels: {
                Shape: Channel[];
                Name: "Channel";
                Nullable: false;
            };
            recurringTasks: {
                Shape: RecurringTask[];
                Name: "RecurringTask";
                Nullable: false;
            };
        };
    };
    ProjectMember: {
        Name: "ProjectMember";
        Shape: ProjectMember;
        Include: Prisma.ProjectMemberInclude;
        Select: Prisma.ProjectMemberSelect;
        OrderBy: Prisma.ProjectMemberOrderByWithRelationInput;
        WhereUnique: Prisma.ProjectMemberWhereUniqueInput;
        Where: Prisma.ProjectMemberWhereInput;
        Create: {};
        Update: {};
        RelationName: "project" | "profile";
        ListRelations: never;
        Relations: {
            project: {
                Shape: Project;
                Name: "Project";
                Nullable: false;
            };
            profile: {
                Shape: Profile;
                Name: "Profile";
                Nullable: false;
            };
        };
    };
    ProjectDoc: {
        Name: "ProjectDoc";
        Shape: ProjectDoc;
        Include: Prisma.ProjectDocInclude;
        Select: Prisma.ProjectDocSelect;
        OrderBy: Prisma.ProjectDocOrderByWithRelationInput;
        WhereUnique: Prisma.ProjectDocWhereUniqueInput;
        Where: Prisma.ProjectDocWhereInput;
        Create: {};
        Update: {};
        RelationName: "project" | "addedBy" | "revisions";
        ListRelations: "revisions";
        Relations: {
            project: {
                Shape: Project;
                Name: "Project";
                Nullable: false;
            };
            addedBy: {
                Shape: Agent | null;
                Name: "Agent";
                Nullable: true;
            };
            revisions: {
                Shape: ProjectDocRevision[];
                Name: "ProjectDocRevision";
                Nullable: false;
            };
        };
    };
    ProjectDocRevision: {
        Name: "ProjectDocRevision";
        Shape: ProjectDocRevision;
        Include: Prisma.ProjectDocRevisionInclude;
        Select: Prisma.ProjectDocRevisionSelect;
        OrderBy: Prisma.ProjectDocRevisionOrderByWithRelationInput;
        WhereUnique: Prisma.ProjectDocRevisionWhereUniqueInput;
        Where: Prisma.ProjectDocRevisionWhereInput;
        Create: {};
        Update: {};
        RelationName: "doc" | "editedBy";
        ListRelations: never;
        Relations: {
            doc: {
                Shape: ProjectDoc;
                Name: "ProjectDoc";
                Nullable: false;
            };
            editedBy: {
                Shape: Agent | null;
                Name: "Agent";
                Nullable: true;
            };
        };
    };
    SystemSettings: {
        Name: "SystemSettings";
        Shape: SystemSettings;
        Include: never;
        Select: Prisma.SystemSettingsSelect;
        OrderBy: Prisma.SystemSettingsOrderByWithRelationInput;
        WhereUnique: Prisma.SystemSettingsWhereUniqueInput;
        Where: Prisma.SystemSettingsWhereInput;
        Create: {};
        Update: {};
        RelationName: never;
        ListRelations: never;
        Relations: {};
    };
    License: {
        Name: "License";
        Shape: License;
        Include: never;
        Select: Prisma.LicenseSelect;
        OrderBy: Prisma.LicenseOrderByWithRelationInput;
        WhereUnique: Prisma.LicenseWhereUniqueInput;
        Where: Prisma.LicenseWhereInput;
        Create: {};
        Update: {};
        RelationName: never;
        ListRelations: never;
        Relations: {};
    };
    FeatureFlag: {
        Name: "FeatureFlag";
        Shape: FeatureFlag;
        Include: never;
        Select: Prisma.FeatureFlagSelect;
        OrderBy: Prisma.FeatureFlagOrderByWithRelationInput;
        WhereUnique: Prisma.FeatureFlagWhereUniqueInput;
        Where: Prisma.FeatureFlagWhereInput;
        Create: {};
        Update: {};
        RelationName: never;
        ListRelations: never;
        Relations: {};
    };
    Task: {
        Name: "Task";
        Shape: Task;
        Include: Prisma.TaskInclude;
        Select: Prisma.TaskSelect;
        OrderBy: Prisma.TaskOrderByWithRelationInput;
        WhereUnique: Prisma.TaskWhereUniqueInput;
        Where: Prisma.TaskWhereInput;
        Create: {};
        Update: {};
        RelationName: "createdByProfile" | "recurringTask" | "parentTask" | "childTasks" | "blockedByTask" | "blockingTasks" | "project" | "assignees" | "agentsWorkingOn" | "messages" | "activities" | "subscriptions" | "workSessions" | "agentActions" | "deliverables" | "queueItems" | "documents" | "notifications" | "userNotifications";
        ListRelations: "childTasks" | "blockingTasks" | "assignees" | "agentsWorkingOn" | "messages" | "activities" | "subscriptions" | "workSessions" | "agentActions" | "deliverables" | "queueItems" | "documents" | "notifications" | "userNotifications";
        Relations: {
            createdByProfile: {
                Shape: Profile | null;
                Name: "Profile";
                Nullable: true;
            };
            recurringTask: {
                Shape: RecurringTask | null;
                Name: "RecurringTask";
                Nullable: true;
            };
            parentTask: {
                Shape: Task | null;
                Name: "Task";
                Nullable: true;
            };
            childTasks: {
                Shape: Task[];
                Name: "Task";
                Nullable: false;
            };
            blockedByTask: {
                Shape: Task | null;
                Name: "Task";
                Nullable: true;
            };
            blockingTasks: {
                Shape: Task[];
                Name: "Task";
                Nullable: false;
            };
            project: {
                Shape: Project | null;
                Name: "Project";
                Nullable: true;
            };
            assignees: {
                Shape: TaskAssignee[];
                Name: "TaskAssignee";
                Nullable: false;
            };
            agentsWorkingOn: {
                Shape: Agent[];
                Name: "Agent";
                Nullable: false;
            };
            messages: {
                Shape: Message[];
                Name: "Message";
                Nullable: false;
            };
            activities: {
                Shape: Activity[];
                Name: "Activity";
                Nullable: false;
            };
            subscriptions: {
                Shape: Subscription[];
                Name: "Subscription";
                Nullable: false;
            };
            workSessions: {
                Shape: WorkSession[];
                Name: "WorkSession";
                Nullable: false;
            };
            agentActions: {
                Shape: AgentAction[];
                Name: "AgentAction";
                Nullable: false;
            };
            deliverables: {
                Shape: Deliverable[];
                Name: "Deliverable";
                Nullable: false;
            };
            queueItems: {
                Shape: AgentQueueItem[];
                Name: "AgentQueueItem";
                Nullable: false;
            };
            documents: {
                Shape: Document[];
                Name: "Document";
                Nullable: false;
            };
            notifications: {
                Shape: Notification[];
                Name: "Notification";
                Nullable: false;
            };
            userNotifications: {
                Shape: UserNotification[];
                Name: "UserNotification";
                Nullable: false;
            };
        };
    };
    TaskAssignee: {
        Name: "TaskAssignee";
        Shape: TaskAssignee;
        Include: Prisma.TaskAssigneeInclude;
        Select: Prisma.TaskAssigneeSelect;
        OrderBy: Prisma.TaskAssigneeOrderByWithRelationInput;
        WhereUnique: Prisma.TaskAssigneeWhereUniqueInput;
        Where: Prisma.TaskAssigneeWhereInput;
        Create: {};
        Update: {};
        RelationName: "task" | "profile";
        ListRelations: never;
        Relations: {
            task: {
                Shape: Task;
                Name: "Task";
                Nullable: false;
            };
            profile: {
                Shape: Profile;
                Name: "Profile";
                Nullable: false;
            };
        };
    };
    TaskTemplate: {
        Name: "TaskTemplate";
        Shape: TaskTemplate;
        Include: never;
        Select: Prisma.TaskTemplateSelect;
        OrderBy: Prisma.TaskTemplateOrderByWithRelationInput;
        WhereUnique: Prisma.TaskTemplateWhereUniqueInput;
        Where: Prisma.TaskTemplateWhereInput;
        Create: {};
        Update: {};
        RelationName: never;
        ListRelations: never;
        Relations: {};
    };
    RecurringTask: {
        Name: "RecurringTask";
        Shape: RecurringTask;
        Include: Prisma.RecurringTaskInclude;
        Select: Prisma.RecurringTaskSelect;
        OrderBy: Prisma.RecurringTaskOrderByWithRelationInput;
        WhereUnique: Prisma.RecurringTaskWhereUniqueInput;
        Where: Prisma.RecurringTaskWhereInput;
        Create: {};
        Update: {};
        RelationName: "createdByProfile" | "project" | "assignees" | "generatedTasks";
        ListRelations: "assignees" | "generatedTasks";
        Relations: {
            createdByProfile: {
                Shape: Profile | null;
                Name: "Profile";
                Nullable: true;
            };
            project: {
                Shape: Project | null;
                Name: "Project";
                Nullable: true;
            };
            assignees: {
                Shape: RecurringTaskAssignee[];
                Name: "RecurringTaskAssignee";
                Nullable: false;
            };
            generatedTasks: {
                Shape: Task[];
                Name: "Task";
                Nullable: false;
            };
        };
    };
    RecurringTaskAssignee: {
        Name: "RecurringTaskAssignee";
        Shape: RecurringTaskAssignee;
        Include: Prisma.RecurringTaskAssigneeInclude;
        Select: Prisma.RecurringTaskAssigneeSelect;
        OrderBy: Prisma.RecurringTaskAssigneeOrderByWithRelationInput;
        WhereUnique: Prisma.RecurringTaskAssigneeWhereUniqueInput;
        Where: Prisma.RecurringTaskAssigneeWhereInput;
        Create: {};
        Update: {};
        RelationName: "recurringTask" | "profile";
        ListRelations: never;
        Relations: {
            recurringTask: {
                Shape: RecurringTask;
                Name: "RecurringTask";
                Nullable: false;
            };
            profile: {
                Shape: Profile;
                Name: "Profile";
                Nullable: false;
            };
        };
    };
    User: {
        Name: "User";
        Shape: User;
        Include: Prisma.UserInclude;
        Select: Prisma.UserSelect;
        OrderBy: Prisma.UserOrderByWithRelationInput;
        WhereUnique: Prisma.UserWhereUniqueInput;
        Where: Prisma.UserWhereInput;
        Create: {};
        Update: {};
        RelationName: "profile" | "adminUser" | "userNotifications" | "pushSubscriptions" | "notificationPreference";
        ListRelations: "userNotifications" | "pushSubscriptions";
        Relations: {
            profile: {
                Shape: Profile | null;
                Name: "Profile";
                Nullable: true;
            };
            adminUser: {
                Shape: AdminUser | null;
                Name: "AdminUser";
                Nullable: true;
            };
            userNotifications: {
                Shape: UserNotification[];
                Name: "UserNotification";
                Nullable: false;
            };
            pushSubscriptions: {
                Shape: PushSubscription[];
                Name: "PushSubscription";
                Nullable: false;
            };
            notificationPreference: {
                Shape: UserNotificationPreference | null;
                Name: "UserNotificationPreference";
                Nullable: true;
            };
        };
    };
    Profile: {
        Name: "Profile";
        Shape: Profile;
        Include: Prisma.ProfileInclude;
        Select: Prisma.ProfileSelect;
        OrderBy: Prisma.ProfileOrderByWithRelationInput;
        WhereUnique: Prisma.ProfileWhereUniqueInput;
        Where: Prisma.ProfileWhereInput;
        Create: {};
        Update: {};
        RelationName: "user" | "agent" | "channelMemberships" | "channelMessagesFrom" | "channelMessagesPinned" | "channelMessageMentions" | "channelMessageReactions" | "channelsCreated" | "messages" | "messageMentions" | "messageReactions" | "taskAssignments" | "createdTasks" | "deliverables" | "deliverableVersions" | "projectMemberships" | "activities" | "createdRecurringTasks" | "recurringTaskAssignments" | "documents";
        ListRelations: "channelMemberships" | "channelMessagesFrom" | "channelMessagesPinned" | "channelMessageMentions" | "channelMessageReactions" | "channelsCreated" | "messages" | "messageMentions" | "messageReactions" | "taskAssignments" | "createdTasks" | "deliverables" | "deliverableVersions" | "projectMemberships" | "activities" | "createdRecurringTasks" | "recurringTaskAssignments" | "documents";
        Relations: {
            user: {
                Shape: User | null;
                Name: "User";
                Nullable: true;
            };
            agent: {
                Shape: Agent | null;
                Name: "Agent";
                Nullable: true;
            };
            channelMemberships: {
                Shape: ChannelMember[];
                Name: "ChannelMember";
                Nullable: false;
            };
            channelMessagesFrom: {
                Shape: ChannelMessage[];
                Name: "ChannelMessage";
                Nullable: false;
            };
            channelMessagesPinned: {
                Shape: ChannelMessage[];
                Name: "ChannelMessage";
                Nullable: false;
            };
            channelMessageMentions: {
                Shape: ChannelMessageMention[];
                Name: "ChannelMessageMention";
                Nullable: false;
            };
            channelMessageReactions: {
                Shape: ChannelMessageReaction[];
                Name: "ChannelMessageReaction";
                Nullable: false;
            };
            channelsCreated: {
                Shape: Channel[];
                Name: "Channel";
                Nullable: false;
            };
            messages: {
                Shape: Message[];
                Name: "Message";
                Nullable: false;
            };
            messageMentions: {
                Shape: MessageMention[];
                Name: "MessageMention";
                Nullable: false;
            };
            messageReactions: {
                Shape: MessageReaction[];
                Name: "MessageReaction";
                Nullable: false;
            };
            taskAssignments: {
                Shape: TaskAssignee[];
                Name: "TaskAssignee";
                Nullable: false;
            };
            createdTasks: {
                Shape: Task[];
                Name: "Task";
                Nullable: false;
            };
            deliverables: {
                Shape: Deliverable[];
                Name: "Deliverable";
                Nullable: false;
            };
            deliverableVersions: {
                Shape: DeliverableVersion[];
                Name: "DeliverableVersion";
                Nullable: false;
            };
            projectMemberships: {
                Shape: ProjectMember[];
                Name: "ProjectMember";
                Nullable: false;
            };
            activities: {
                Shape: Activity[];
                Name: "Activity";
                Nullable: false;
            };
            createdRecurringTasks: {
                Shape: RecurringTask[];
                Name: "RecurringTask";
                Nullable: false;
            };
            recurringTaskAssignments: {
                Shape: RecurringTaskAssignee[];
                Name: "RecurringTaskAssignee";
                Nullable: false;
            };
            documents: {
                Shape: Document[];
                Name: "Document";
                Nullable: false;
            };
        };
    };
}
export function getDatamodel(): PothosPrismaDatamodel { return JSON.parse("{\"datamodel\":{\"models\":{\"Activity\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"ActivityType\",\"kind\":\"enum\",\"name\":\"type\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"profileId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"taskId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"projectId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"message\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Json\",\"kind\":\"scalar\",\"name\":\"metadata\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"profile\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ActivityToProfile\",\"relationFromFields\":[\"profileId\"],\"isUpdatedAt\":false},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"task\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ActivityToTask\",\"relationFromFields\":[\"taskId\"],\"isUpdatedAt\":false},{\"type\":\"Project\",\"kind\":\"object\",\"name\":\"project\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ActivityToProject\",\"relationFromFields\":[\"projectId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Agent\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"role\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"AgentStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DetailedStatus\",\"kind\":\"enum\",\"name\":\"detailedStatus\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"statusMessage\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"currentTaskId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"currentTask\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"avatar\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"personality\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"workspacePath\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"identityEmoji\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"AgentLevel\",\"kind\":\"enum\",\"name\":\"level\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"username\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"lastHeartbeat\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"SetupStatus\",\"kind\":\"enum\",\"name\":\"setupStatus\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"apiKeyHash\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"apiKeyPrefix\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"apiKeyCreatedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"isOnVacation\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"templateId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"configVersion\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"HostingType\",\"kind\":\"enum\",\"name\":\"hostingType\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"cloudVmId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"llmModel\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"createdBy\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"currentTaskRef\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentCurrentTask\",\"relationFromFields\":[\"currentTaskId\"],\"isUpdatedAt\":false},{\"type\":\"Document\",\"kind\":\"object\",\"name\":\"documents\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToDocument\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Notification\",\"kind\":\"object\",\"name\":\"notifications\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToNotification\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Subscription\",\"kind\":\"object\",\"name\":\"subscriptions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToSubscription\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"WorkSession\",\"kind\":\"object\",\"name\":\"workSessions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToWorkSession\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"StatusHistory\",\"kind\":\"object\",\"name\":\"statusHistory\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToStatusHistory\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"AgentAction\",\"kind\":\"object\",\"name\":\"agentActions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToAgentAction\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"AgentQueueItem\",\"kind\":\"object\",\"name\":\"queueItems\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToAgentQueueItem\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"ProjectDoc\",\"kind\":\"object\",\"name\":\"projectDocsAdded\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProjectDocAddedBy\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"ProjectDocRevision\",\"kind\":\"object\",\"name\":\"projectDocRevisions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProjectDocRevisionEditedBy\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"profile\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToProfile\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"CloudVM\",\"kind\":\"object\",\"name\":\"cloudVm\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToCloudVM\",\"relationFromFields\":[\"cloudVmId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"StatusHistory\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"agentId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"AgentStatus\",\"kind\":\"enum\",\"name\":\"fromStatus\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"AgentStatus\",\"kind\":\"enum\",\"name\":\"toStatus\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DetailedStatus\",\"kind\":\"enum\",\"name\":\"fromDetailedStatus\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DetailedStatus\",\"kind\":\"enum\",\"name\":\"toDetailedStatus\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"statusMessage\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"timestamp\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Agent\",\"kind\":\"object\",\"name\":\"agent\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToStatusHistory\",\"relationFromFields\":[\"agentId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"WorkSession\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"taskId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"agentId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"projectId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"startedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"endedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"duration\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"WorkSessionEventType\",\"kind\":\"enum\",\"name\":\"eventType\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"task\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaskToWorkSession\",\"relationFromFields\":[\"taskId\"],\"isUpdatedAt\":false},{\"type\":\"Agent\",\"kind\":\"object\",\"name\":\"agent\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToWorkSession\",\"relationFromFields\":[\"agentId\"],\"isUpdatedAt\":false},{\"type\":\"Project\",\"kind\":\"object\",\"name\":\"project\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProjectToWorkSession\",\"relationFromFields\":[\"projectId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"AgentAction\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"agentId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"taskId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"projectId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"AgentActionType\",\"kind\":\"enum\",\"name\":\"actionType\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"description\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Json\",\"kind\":\"scalar\",\"name\":\"metadata\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"timestamp\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Agent\",\"kind\":\"object\",\"name\":\"agent\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToAgentAction\",\"relationFromFields\":[\"agentId\"],\"isUpdatedAt\":false},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"task\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentActionToTask\",\"relationFromFields\":[\"taskId\"],\"isUpdatedAt\":false},{\"type\":\"Project\",\"kind\":\"object\",\"name\":\"project\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentActionToProject\",\"relationFromFields\":[\"projectId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"AgentQueueItem\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"agentId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"title\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"description\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"notes\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"QueueItemStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"QueueItemPriority\",\"kind\":\"enum\",\"name\":\"priority\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"relatedTaskId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"projectId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"parentQueueItemId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"QueueItemType\",\"kind\":\"enum\",\"name\":\"itemType\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"autoGenerated\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"generatedFrom\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"startedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"completedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"dueDate\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"order\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Agent\",\"kind\":\"object\",\"name\":\"agent\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToAgentQueueItem\",\"relationFromFields\":[\"agentId\"],\"isUpdatedAt\":false},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"relatedTask\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentQueueItemToTask\",\"relationFromFields\":[\"relatedTaskId\"],\"isUpdatedAt\":false},{\"type\":\"Project\",\"kind\":\"object\",\"name\":\"project\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentQueueItemToProject\",\"relationFromFields\":[\"projectId\"],\"isUpdatedAt\":false},{\"type\":\"AgentQueueItem\",\"kind\":\"object\",\"name\":\"parentQueueItem\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"QueueItemParent\",\"relationFromFields\":[\"parentQueueItemId\"],\"isUpdatedAt\":false},{\"type\":\"AgentQueueItem\",\"kind\":\"object\",\"name\":\"childQueueItems\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"QueueItemParent\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"AdminUser\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"username\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"passwordHash\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"sessionsRevokedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"user\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AdminUserToUser\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false},{\"type\":\"PasswordResetToken\",\"kind\":\"object\",\"name\":\"resetTokensReceived\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ResetTokenTarget\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"PasswordResetToken\",\"kind\":\"object\",\"name\":\"resetTokensCreated\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ResetTokenCreator\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"PasswordResetToken\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tokenHash\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"adminUserId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"createdById\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"expiresAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"usedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"AdminUser\",\"kind\":\"object\",\"name\":\"adminUser\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ResetTokenTarget\",\"relationFromFields\":[\"adminUserId\"],\"isUpdatedAt\":false},{\"type\":\"AdminUser\",\"kind\":\"object\",\"name\":\"createdBy\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ResetTokenCreator\",\"relationFromFields\":[\"createdById\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Channel\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"slug\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"ChannelVisibility\",\"kind\":\"enum\",\"name\":\"visibility\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"description\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"projectId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"createdByProfileId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"createdByProfile\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelCreatedByProfile\",\"relationFromFields\":[\"createdByProfileId\"],\"isUpdatedAt\":false},{\"type\":\"Project\",\"kind\":\"object\",\"name\":\"project\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelToProject\",\"relationFromFields\":[\"projectId\"],\"isUpdatedAt\":false},{\"type\":\"ChannelMember\",\"kind\":\"object\",\"name\":\"members\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelToChannelMember\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"ChannelMessage\",\"kind\":\"object\",\"name\":\"messages\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelToChannelMessage\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"ChannelMember\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"channelId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"profileId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"ChannelMemberRole\",\"kind\":\"enum\",\"name\":\"role\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"joinedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"lastReadAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Channel\",\"kind\":\"object\",\"name\":\"channel\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelToChannelMember\",\"relationFromFields\":[\"channelId\"],\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"profile\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMemberToProfile\",\"relationFromFields\":[\"profileId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"channelId\",\"profileId\"]}]},\"ChannelMessage\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"channelId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"fromProfileId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"content\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"pinnedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"pinnedByProfileId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Channel\",\"kind\":\"object\",\"name\":\"channel\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelToChannelMessage\",\"relationFromFields\":[\"channelId\"],\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"fromProfile\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMessageFrom\",\"relationFromFields\":[\"fromProfileId\"],\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"pinnedByProfile\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMessagePinnedBy\",\"relationFromFields\":[\"pinnedByProfileId\"],\"isUpdatedAt\":false},{\"type\":\"ChannelMessageAttachment\",\"kind\":\"object\",\"name\":\"attachments\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMessageToChannelMessageAttachment\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"ChannelMessageMention\",\"kind\":\"object\",\"name\":\"mentions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMessageToChannelMessageMention\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"ChannelMessageReaction\",\"kind\":\"object\",\"name\":\"reactions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMessageToChannelMessageReaction\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"ChannelMessageAttachment\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"messageId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"documentId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"ChannelMessage\",\"kind\":\"object\",\"name\":\"message\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMessageToChannelMessageAttachment\",\"relationFromFields\":[\"messageId\"],\"isUpdatedAt\":false},{\"type\":\"Document\",\"kind\":\"object\",\"name\":\"document\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMessageAttachmentToDocument\",\"relationFromFields\":[\"documentId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"messageId\",\"documentId\"]}]},\"ChannelMessageMention\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"messageId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"profileId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"ChannelMessage\",\"kind\":\"object\",\"name\":\"message\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMessageToChannelMessageMention\",\"relationFromFields\":[\"messageId\"],\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"profile\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMessageMentionToProfile\",\"relationFromFields\":[\"profileId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"messageId\",\"profileId\"]}]},\"ChannelMessageReaction\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"messageId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"profileId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"emoji\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"ChannelMessage\",\"kind\":\"object\",\"name\":\"message\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMessageToChannelMessageReaction\",\"relationFromFields\":[\"messageId\"],\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"profile\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMessageReactionToProfile\",\"relationFromFields\":[\"profileId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"messageId\",\"profileId\",\"emoji\"]}]},\"CloudVM\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DeploymentProvider\",\"kind\":\"enum\",\"name\":\"provider\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DeploymentStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"externalServerId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"serverName\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"ipv4\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"region\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"serverType\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"webhookSecret\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"sshPrivateKey\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"sshPublicKey\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"hetznerSshKeyId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"setupStep\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"setupProgress\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"errorMessage\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"errorAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"provisionedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"installedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"stoppedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"destroyedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"totalUptimeSeconds\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"estimatedCostCents\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"llmConfigured\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"llmProvider\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"llmModel\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"gatewayToken\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"liveGatewayTokenId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Agent\",\"kind\":\"object\",\"name\":\"agents\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToCloudVM\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"CloudVMLog\",\"kind\":\"object\",\"name\":\"logs\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"CloudVMToCloudVMLog\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"CloudVMUsage\",\"kind\":\"object\",\"name\":\"usageRecords\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"CloudVMToCloudVMUsage\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"CloudVMLog\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"vmId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"message\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"level\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"CloudVM\",\"kind\":\"object\",\"name\":\"vm\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"CloudVMToCloudVMLog\",\"relationFromFields\":[\"vmId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"CloudVMUsage\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"vmId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"periodStart\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"periodEnd\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"uptimeSeconds\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"costCents\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"CloudVM\",\"kind\":\"object\",\"name\":\"vm\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"CloudVMToCloudVMUsage\",\"relationFromFields\":[\"vmId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Deliverable\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"taskId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"profileId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"projectId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"title\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DeliverableKind\",\"kind\":\"enum\",\"name\":\"kind\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"content\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"language\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"storageKey\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"fileName\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"mimeType\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"fileSize\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"url\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"version\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"task\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DeliverableToTask\",\"relationFromFields\":[\"taskId\"],\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"profile\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DeliverableToProfile\",\"relationFromFields\":[\"profileId\"],\"isUpdatedAt\":false},{\"type\":\"Project\",\"kind\":\"object\",\"name\":\"project\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DeliverableToProject\",\"relationFromFields\":[\"projectId\"],\"isUpdatedAt\":false},{\"type\":\"DeliverableVersion\",\"kind\":\"object\",\"name\":\"versions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DeliverableToDeliverableVersion\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"DeliverableVersion\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"deliverableId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"version\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"title\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DeliverableKind\",\"kind\":\"enum\",\"name\":\"kind\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"content\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"language\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"storageKey\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"fileName\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"mimeType\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"fileSize\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"url\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"editedByProfileId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Deliverable\",\"kind\":\"object\",\"name\":\"deliverable\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DeliverableToDeliverableVersion\",\"relationFromFields\":[\"deliverableId\"],\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"editedByProfile\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DeliverableVersionEditedByProfile\",\"relationFromFields\":[\"editedByProfileId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Document\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"title\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"content\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DocumentType\",\"kind\":\"enum\",\"name\":\"type\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"taskId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"projectId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"createdById\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"createdByProfileId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"storageKey\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"fileName\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"mimeType\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"fileSize\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Agent\",\"kind\":\"object\",\"name\":\"createdBy\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToDocument\",\"relationFromFields\":[\"createdById\"],\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"createdByProfile\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DocumentToProfile\",\"relationFromFields\":[\"createdByProfileId\"],\"isUpdatedAt\":false},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"task\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DocumentToTask\",\"relationFromFields\":[\"taskId\"],\"isUpdatedAt\":false},{\"type\":\"Project\",\"kind\":\"object\",\"name\":\"project\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DocumentToProject\",\"relationFromFields\":[\"projectId\"],\"isUpdatedAt\":false},{\"type\":\"MessageAttachment\",\"kind\":\"object\",\"name\":\"messageAttachments\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DocumentToMessageAttachment\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"ChannelMessageAttachment\",\"kind\":\"object\",\"name\":\"channelMessageAttachments\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMessageAttachmentToDocument\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"UsedNonce\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"nonce\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"usedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"LiveGatewayToken\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tokenHash\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tokenPrefix\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"isActive\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"lastUsedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"revokedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"LiveGatewayConnection\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"machineFingerprint\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"connectionToken\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"machineName\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"connectionStatus\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"connectedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"lastDisconnectedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"pluginVersion\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Json\",\"kind\":\"scalar\",\"name\":\"hostMeta\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"LiveAgentRoute\",\"kind\":\"object\",\"name\":\"agentRoutes\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LiveAgentRouteToLiveGatewayConnection\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"LivePendingDelivery\",\"kind\":\"object\",\"name\":\"pendingDeliveries\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LiveGatewayConnectionToLivePendingDelivery\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"LiveAgentRoute\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"connectionId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"agentSlug\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"LiveGatewayConnection\",\"kind\":\"object\",\"name\":\"connection\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LiveAgentRouteToLiveGatewayConnection\",\"relationFromFields\":[\"connectionId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"connectionId\",\"agentSlug\"]}]},\"LivePendingDelivery\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"connectionId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"agentSlug\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"taskId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"message\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"priority\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"idempotencyKey\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"expiresAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"delivered\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"deliveredAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"LiveGatewayConnection\",\"kind\":\"object\",\"name\":\"connection\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LiveGatewayConnectionToLivePendingDelivery\",\"relationFromFields\":[\"connectionId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Message\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"taskId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"fromProfileId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"content\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"projectId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"task\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageToTask\",\"relationFromFields\":[\"taskId\"],\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"fromProfile\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageToProfile\",\"relationFromFields\":[\"fromProfileId\"],\"isUpdatedAt\":false},{\"type\":\"Project\",\"kind\":\"object\",\"name\":\"project\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageToProject\",\"relationFromFields\":[\"projectId\"],\"isUpdatedAt\":false},{\"type\":\"MessageAttachment\",\"kind\":\"object\",\"name\":\"attachments\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageToMessageAttachment\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"MessageMention\",\"kind\":\"object\",\"name\":\"mentions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageToMessageMention\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"MessageReaction\",\"kind\":\"object\",\"name\":\"reactions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageToMessageReaction\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Notification\",\"kind\":\"object\",\"name\":\"notifications\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageToNotification\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"UserNotification\",\"kind\":\"object\",\"name\":\"userNotifications\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageToUserNotification\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"MessageAttachment\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"messageId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"documentId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Message\",\"kind\":\"object\",\"name\":\"message\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageToMessageAttachment\",\"relationFromFields\":[\"messageId\"],\"isUpdatedAt\":false},{\"type\":\"Document\",\"kind\":\"object\",\"name\":\"document\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DocumentToMessageAttachment\",\"relationFromFields\":[\"documentId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"messageId\",\"documentId\"]}]},\"MessageMention\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"messageId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"profileId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Message\",\"kind\":\"object\",\"name\":\"message\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageToMessageMention\",\"relationFromFields\":[\"messageId\"],\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"profile\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageMentionToProfile\",\"relationFromFields\":[\"profileId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"messageId\",\"profileId\"]}]},\"MessageReaction\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"messageId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"profileId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"emoji\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Message\",\"kind\":\"object\",\"name\":\"message\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageToMessageReaction\",\"relationFromFields\":[\"messageId\"],\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"profile\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageReactionToProfile\",\"relationFromFields\":[\"profileId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"messageId\",\"profileId\",\"emoji\"]}]},\"Notification\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"mentionedAgentId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"content\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"taskId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"messageId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"delivered\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"deliveredAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Agent\",\"kind\":\"object\",\"name\":\"mentionedAgent\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToNotification\",\"relationFromFields\":[\"mentionedAgentId\"],\"isUpdatedAt\":false},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"task\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"NotificationToTask\",\"relationFromFields\":[\"taskId\"],\"isUpdatedAt\":false},{\"type\":\"Message\",\"kind\":\"object\",\"name\":\"message\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageToNotification\",\"relationFromFields\":[\"messageId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Subscription\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"agentId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"taskId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"subscribedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Agent\",\"kind\":\"object\",\"name\":\"agent\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToSubscription\",\"relationFromFields\":[\"agentId\"],\"isUpdatedAt\":false},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"task\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"SubscriptionToTask\",\"relationFromFields\":[\"taskId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"agentId\",\"taskId\"]}]},\"UserNotification\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"UserNotificationType\",\"kind\":\"enum\",\"name\":\"type\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"NotificationChannel\",\"kind\":\"enum\",\"name\":\"channel\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"NotificationStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"title\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"body\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"taskId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"messageId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"url\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Json\",\"kind\":\"scalar\",\"name\":\"metadata\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"readAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"sentAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"errorMsg\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"retryCount\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"nextRetryAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"dedupKey\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"user\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"UserToUserNotification\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"task\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaskToUserNotification\",\"relationFromFields\":[\"taskId\"],\"isUpdatedAt\":false},{\"type\":\"Message\",\"kind\":\"object\",\"name\":\"message\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageToUserNotification\",\"relationFromFields\":[\"messageId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"dedupKey\",\"channel\"]}]},\"PushSubscription\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"endpoint\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"p256dh\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"auth\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"userAgent\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"user\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"PushSubscriptionToUser\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"userId\",\"endpoint\"]}]},\"UserNotificationPreference\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"taskDone\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"taskNeedsReview\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"taskClarificationRequested\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"taskApproved\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"taskRejected\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"newComment\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"mention\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"deliverableSubmitted\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"taskAssigned\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"teamUpdate\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"documentAdded\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"pushEnabled\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"emailEnabled\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"inAppEnabled\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"quietStart\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"quietEnd\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"timezone\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"user\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"UserToUserNotificationPreference\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Project\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"description\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"ProjectStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"shutdownActive\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"ProjectMember\",\"kind\":\"object\",\"name\":\"members\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProjectToProjectMember\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"tasks\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProjectToTask\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"ProjectDoc\",\"kind\":\"object\",\"name\":\"projectDocs\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProjectToProjectDoc\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Activity\",\"kind\":\"object\",\"name\":\"activities\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ActivityToProject\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Message\",\"kind\":\"object\",\"name\":\"messages\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageToProject\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Document\",\"kind\":\"object\",\"name\":\"documents\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DocumentToProject\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"WorkSession\",\"kind\":\"object\",\"name\":\"workSessions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProjectToWorkSession\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"AgentAction\",\"kind\":\"object\",\"name\":\"agentActions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentActionToProject\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Deliverable\",\"kind\":\"object\",\"name\":\"deliverables\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DeliverableToProject\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"AgentQueueItem\",\"kind\":\"object\",\"name\":\"queueItems\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentQueueItemToProject\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Channel\",\"kind\":\"object\",\"name\":\"channels\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelToProject\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"RecurringTask\",\"kind\":\"object\",\"name\":\"recurringTasks\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProjectToRecurringTask\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"ProjectMember\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"projectId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"profileId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"ProjectMemberStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"joinedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Project\",\"kind\":\"object\",\"name\":\"project\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProjectToProjectMember\",\"relationFromFields\":[\"projectId\"],\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"profile\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProfileToProjectMember\",\"relationFromFields\":[\"profileId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"projectId\",\"profileId\"]}]},\"ProjectDoc\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"projectId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"title\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"summary\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"content\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"addedById\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Project\",\"kind\":\"object\",\"name\":\"project\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProjectToProjectDoc\",\"relationFromFields\":[\"projectId\"],\"isUpdatedAt\":false},{\"type\":\"Agent\",\"kind\":\"object\",\"name\":\"addedBy\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProjectDocAddedBy\",\"relationFromFields\":[\"addedById\"],\"isUpdatedAt\":false},{\"type\":\"ProjectDocRevision\",\"kind\":\"object\",\"name\":\"revisions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProjectDocToProjectDocRevision\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"ProjectDocRevision\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"docId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"title\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"summary\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"content\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"editedById\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"ProjectDocEditAction\",\"kind\":\"enum\",\"name\":\"editAction\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"ProjectDoc\",\"kind\":\"object\",\"name\":\"doc\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProjectDocToProjectDocRevision\",\"relationFromFields\":[\"docId\"],\"isUpdatedAt\":false},{\"type\":\"Agent\",\"kind\":\"object\",\"name\":\"editedBy\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProjectDocRevisionEditedBy\",\"relationFromFields\":[\"editedById\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"SystemSettings\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"shutdownActive\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"onboardingCompleted\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"onboardingCategoryId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"License\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"token\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"plan\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"org\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"maxAgents\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"maxProjects\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"maxSeats\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"features\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"instanceId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"expiresAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"activatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"lastVerifiedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"FeatureFlag\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"key\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"enabled\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"FlagManagedBy\",\"kind\":\"enum\",\"name\":\"managedBy\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"description\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Task\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"title\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"description\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"TaskStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Priority\",\"kind\":\"enum\",\"name\":\"priority\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"createdByProfileId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"dueDate\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"deletedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tags\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"taskNumber\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"parentTaskId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"projectId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"blockedByTaskId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"recurringTaskId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"createdByProfile\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaskCreatedByProfile\",\"relationFromFields\":[\"createdByProfileId\"],\"isUpdatedAt\":false},{\"type\":\"RecurringTask\",\"kind\":\"object\",\"name\":\"recurringTask\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaskFromRecurring\",\"relationFromFields\":[\"recurringTaskId\"],\"isUpdatedAt\":false},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"parentTask\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaskParentChild\",\"relationFromFields\":[\"parentTaskId\"],\"isUpdatedAt\":false},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"childTasks\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaskParentChild\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"blockedByTask\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaskBlockedBy\",\"relationFromFields\":[\"blockedByTaskId\"],\"isUpdatedAt\":false},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"blockingTasks\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaskBlockedBy\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Project\",\"kind\":\"object\",\"name\":\"project\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProjectToTask\",\"relationFromFields\":[\"projectId\"],\"isUpdatedAt\":false},{\"type\":\"TaskAssignee\",\"kind\":\"object\",\"name\":\"assignees\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaskToTaskAssignee\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Agent\",\"kind\":\"object\",\"name\":\"agentsWorkingOn\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentCurrentTask\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Message\",\"kind\":\"object\",\"name\":\"messages\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageToTask\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Activity\",\"kind\":\"object\",\"name\":\"activities\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ActivityToTask\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Subscription\",\"kind\":\"object\",\"name\":\"subscriptions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"SubscriptionToTask\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"WorkSession\",\"kind\":\"object\",\"name\":\"workSessions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaskToWorkSession\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"AgentAction\",\"kind\":\"object\",\"name\":\"agentActions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentActionToTask\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Deliverable\",\"kind\":\"object\",\"name\":\"deliverables\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DeliverableToTask\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"AgentQueueItem\",\"kind\":\"object\",\"name\":\"queueItems\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentQueueItemToTask\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Document\",\"kind\":\"object\",\"name\":\"documents\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DocumentToTask\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Notification\",\"kind\":\"object\",\"name\":\"notifications\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"NotificationToTask\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"UserNotification\",\"kind\":\"object\",\"name\":\"userNotifications\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaskToUserNotification\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"taskNumber\"]}]},\"TaskAssignee\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"taskId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"profileId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"assignedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"task\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaskToTaskAssignee\",\"relationFromFields\":[\"taskId\"],\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"profile\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProfileToTaskAssignee\",\"relationFromFields\":[\"profileId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"taskId\",\"profileId\"]}]},\"TaskTemplate\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"description\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Json\",\"kind\":\"scalar\",\"name\":\"subtasks\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"RecurringTask\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"title\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"description\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"TaskStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Priority\",\"kind\":\"enum\",\"name\":\"priority\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tags\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Json\",\"kind\":\"scalar\",\"name\":\"recurrenceConfig\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"isActive\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"timezone\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"nextDueAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"lastGeneratedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"createdByProfileId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"projectId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"createdByProfile\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"RecurringTaskCreatedByProfile\",\"relationFromFields\":[\"createdByProfileId\"],\"isUpdatedAt\":false},{\"type\":\"Project\",\"kind\":\"object\",\"name\":\"project\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProjectToRecurringTask\",\"relationFromFields\":[\"projectId\"],\"isUpdatedAt\":false},{\"type\":\"RecurringTaskAssignee\",\"kind\":\"object\",\"name\":\"assignees\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"RecurringTaskToRecurringTaskAssignee\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"generatedTasks\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaskFromRecurring\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"RecurringTaskAssignee\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"recurringTaskId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"profileId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"assignedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"RecurringTask\",\"kind\":\"object\",\"name\":\"recurringTask\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"RecurringTaskToRecurringTaskAssignee\",\"relationFromFields\":[\"recurringTaskId\"],\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"profile\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProfileToRecurringTaskAssignee\",\"relationFromFields\":[\"profileId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"recurringTaskId\",\"profileId\"]}]},\"User\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"email\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"passwordHash\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"profile\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProfileToUser\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"AdminUser\",\"kind\":\"object\",\"name\":\"adminUser\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AdminUserToUser\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"UserNotification\",\"kind\":\"object\",\"name\":\"userNotifications\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"UserToUserNotification\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"PushSubscription\",\"kind\":\"object\",\"name\":\"pushSubscriptions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"PushSubscriptionToUser\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"UserNotificationPreference\",\"kind\":\"object\",\"name\":\"notificationPreference\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"UserToUserNotificationPreference\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Profile\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"ProfileKind\",\"kind\":\"enum\",\"name\":\"kind\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"displayName\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"username\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"avatarUrl\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"bio\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"agentId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"user\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProfileToUser\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false},{\"type\":\"Agent\",\"kind\":\"object\",\"name\":\"agent\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AgentToProfile\",\"relationFromFields\":[\"agentId\"],\"isUpdatedAt\":false},{\"type\":\"ChannelMember\",\"kind\":\"object\",\"name\":\"channelMemberships\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMemberToProfile\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"ChannelMessage\",\"kind\":\"object\",\"name\":\"channelMessagesFrom\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMessageFrom\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"ChannelMessage\",\"kind\":\"object\",\"name\":\"channelMessagesPinned\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMessagePinnedBy\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"ChannelMessageMention\",\"kind\":\"object\",\"name\":\"channelMessageMentions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMessageMentionToProfile\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"ChannelMessageReaction\",\"kind\":\"object\",\"name\":\"channelMessageReactions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelMessageReactionToProfile\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Channel\",\"kind\":\"object\",\"name\":\"channelsCreated\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ChannelCreatedByProfile\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Message\",\"kind\":\"object\",\"name\":\"messages\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageToProfile\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"MessageMention\",\"kind\":\"object\",\"name\":\"messageMentions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageMentionToProfile\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"MessageReaction\",\"kind\":\"object\",\"name\":\"messageReactions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MessageReactionToProfile\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"TaskAssignee\",\"kind\":\"object\",\"name\":\"taskAssignments\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProfileToTaskAssignee\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Task\",\"kind\":\"object\",\"name\":\"createdTasks\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaskCreatedByProfile\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Deliverable\",\"kind\":\"object\",\"name\":\"deliverables\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DeliverableToProfile\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"DeliverableVersion\",\"kind\":\"object\",\"name\":\"deliverableVersions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DeliverableVersionEditedByProfile\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"ProjectMember\",\"kind\":\"object\",\"name\":\"projectMemberships\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProfileToProjectMember\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Activity\",\"kind\":\"object\",\"name\":\"activities\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ActivityToProfile\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"RecurringTask\",\"kind\":\"object\",\"name\":\"createdRecurringTasks\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"RecurringTaskCreatedByProfile\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"RecurringTaskAssignee\",\"kind\":\"object\",\"name\":\"recurringTaskAssignments\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProfileToRecurringTaskAssignee\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Document\",\"kind\":\"object\",\"name\":\"documents\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DocumentToProfile\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]}}}}"); }
/**
 * @agentcenter/database - Prisma Model Delegates
 *
 * Re-export prisma model delegates so application Model<T> constructors
 * can reference them without importing the prisma instance directly.
 */

import { prisma } from "../client";

export const agentDelegate = () => prisma.agent;
export const taskDelegate = () => prisma.task;
export const recurringTaskDelegate = () => prisma.recurringTask;
export const projectDelegate = () => prisma.project;
export const notificationDelegate = () => prisma.notification;
export const activityDelegate = () => prisma.activity;
export const adminUserDelegate = () => prisma.adminUser;
export const agentActionDelegate = () => prisma.agentAction;
export const agentQueueItemDelegate = () => prisma.agentQueueItem;
export const deliverableVersionDelegate = () => prisma.deliverableVersion;
export const deliverableDelegate = () => prisma.deliverable;
export const documentDelegate = () => prisma.document;
export const messageDelegate = () => prisma.message;
export const messageReactionDelegate = () => prisma.messageReaction;
export const projectDocDelegate = () => prisma.projectDoc;
export const projectDocRevisionDelegate = () => prisma.projectDocRevision;
export const projectMemberDelegate = () => prisma.projectMember;
export const statusHistoryDelegate = () => prisma.statusHistory;
export const subscriptionDelegate = () => prisma.subscription;
export const taskTemplateDelegate = () => prisma.taskTemplate;
export const workSessionDelegate = () => prisma.workSession;

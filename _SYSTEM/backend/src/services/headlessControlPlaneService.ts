import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { logEvent } from '../models/queries';
import { planExecutiveIntegrationRoute, ExecutiveIntegrationRoute } from './executiveIntegrationService';
import { RoutingDecision, SmartRouter } from './smartRouter';

export type HeadlessControlMode = 'dry-run' | 'plan';

export interface HeadlessControlRequest {
    prompt: string;
    mode?: HeadlessControlMode;
    source?: string;
}

export interface HeadlessControlGuardrails {
    uiRemoved: true;
    liveTradingSimulationsEnabled: false;
    hyperframesRendererEnabled: false;
    externalSendRequiresConfirmation: boolean;
    repoWritesEnabled: false;
}

export interface HeadlessControlPlan {
    planId: string;
    prompt: string;
    normalizedPrompt: string;
    mode: HeadlessControlMode;
    createdAt: string;
    routeDecision: RoutingDecision;
    executiveRoute: ExecutiveIntegrationRoute;
    lane: {
        id: string;
        title: string;
        surface: string;
    };
    guardrails: HeadlessControlGuardrails;
    blockedActions: string[];
    nextAction: string;
    notes: string[];
}

export class HeadlessControlPlaneService {
    constructor(private readonly db?: Database.Database) {}

    plan(input: HeadlessControlRequest): HeadlessControlPlan {
        const normalizedPrompt = String(input.prompt || '').trim();
        if (!normalizedPrompt) {
            throw new Error('prompt required');
        }

        const mode: HeadlessControlMode = input.mode === 'plan' ? 'plan' : 'dry-run';
        const routeDecision = SmartRouter.route(normalizedPrompt);
        const executiveRoute = planExecutiveIntegrationRoute(normalizedPrompt);
        const blockedActions = this.mergeBlockedActions(routeDecision, executiveRoute);
        const nextAction = this.resolveNextAction(routeDecision);
        const notes = this.buildNotes(routeDecision, executiveRoute, input.source);
        const planId = `headless-${crypto.createHash('sha256').update(normalizedPrompt).digest('hex').slice(0, 16)}`;
        const createdAt = new Date().toISOString();

        if (this.db) {
            logEvent(
                this.db,
                'SYSTEM',
                'HEADLESS_CONTROL',
                `Planned ${routeDecision.yuriLane} via ${routeDecision.integrationSurface} (${routeDecision.actionGate})`,
                'INFO',
                {
                    planId,
                    mode,
                    source: input.source || 'api',
                    lane: routeDecision.yuriLane,
                    surface: routeDecision.integrationSurface,
                    actionGate: routeDecision.actionGate,
                    prompt: normalizedPrompt
                }
            );
        }

        return {
            planId,
            prompt: String(input.prompt),
            normalizedPrompt,
            mode,
            createdAt,
            routeDecision,
            executiveRoute,
            lane: {
                id: executiveRoute.lane.lane,
                title: executiveRoute.lane.title,
                surface: executiveRoute.lane.integrationSurface
            },
            guardrails: {
                uiRemoved: true,
                liveTradingSimulationsEnabled: false,
                hyperframesRendererEnabled: false,
                externalSendRequiresConfirmation: routeDecision.actionGate === 'confirm_before_send',
                repoWritesEnabled: false
            },
            blockedActions,
            nextAction,
            notes
        };
    }

    private mergeBlockedActions(routeDecision: RoutingDecision, executiveRoute: ExecutiveIntegrationRoute): string[] {
        const headlessOnlyBlocks = [
            'frontend_runtime_disabled',
            'active_trading_simulations_disabled',
            'hyperframes_renderer_deferred'
        ];

        const actionGateBlocks =
            routeDecision.actionGate === 'approval_required'
                ? ['unapproved_external_execution']
                : routeDecision.actionGate === 'confirm_before_send'
                    ? ['unconfirmed_send']
                    : [];

        return [...new Set([...executiveRoute.blockedActions, ...headlessOnlyBlocks, ...actionGateBlocks])];
    }

    private resolveNextAction(routeDecision: RoutingDecision): string {
        if (routeDecision.actionGate === 'approval_required') {
            return 'Prepare an approval packet before any external action.';
        }

        if (routeDecision.actionGate === 'confirm_before_send') {
            return 'Create the draft and wait for explicit send confirmation.';
        }

        if (routeDecision.actionGate === 'simulation_only') {
            return 'Record the thesis and defer simulation and live execution until the trading core is restored.';
        }

        if (routeDecision.actionGate === 'capture_only') {
            return 'Capture evidence and attach it to the active request.';
        }

        if (routeDecision.actionGate === 'render_only') {
            return 'Keep the render brief only; defer Hyperframes until the renderer is restored.';
        }

        if (routeDecision.actionGate === 'draft_only') {
            return 'Create governed draft artifacts for operator review.';
        }

        return 'Route through the core Oracle surface.';
    }

    private buildNotes(routeDecision: RoutingDecision, executiveRoute: ExecutiveIntegrationRoute, source?: string): string[] {
        const notes = [
            'UI removed from the active runtime; backend is the operator surface.',
            'Active trading simulations remain deferred.',
            'Hyperframes rendering remains deferred.',
            `Headless plan targets the ${routeDecision.yuriLane} lane.`,
            `Integration surface: ${routeDecision.integrationSurface}.`
        ];

        if (source) {
            notes.push(`Source: ${source}.`);
        }

        if (routeDecision.yuriLane === 'inbox') {
            notes.push('Inbox work stays draft-only until explicit confirmation is recorded.');
        }

        if (routeDecision.yuriLane === 'growth') {
            notes.push('Growth work emits draft artifacts only.');
        }

        if (routeDecision.yuriLane === 'browser') {
            notes.push('Browser work is capture-only and must keep evidence attached.');
        }

        if (routeDecision.yuriLane === 'trading') {
            notes.push('Trading lane is routing-only until Yuri is fully operational.');
        }

        if (routeDecision.yuriLane === 'media') {
            notes.push('Media render jobs stay speculative until the renderer returns.');
        }

        if (executiveRoute.blockedActions.length > 0) {
            notes.push(`Blocked actions: ${executiveRoute.blockedActions.join(', ')}.`);
        }

        return notes;
    }
}

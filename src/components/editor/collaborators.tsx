'use client';

import { useEffect, useState } from 'react';
import { Users, Circle } from 'lucide-react';
import { WebsocketProvider } from 'y-websocket';

interface CollaboratorState {
  clientId: number;
  name: string;
  color: string;
  file?: string;
}

interface CollaboratorsProps {
  provider: WebsocketProvider;
}

/**
 * Displays colored avatar dots for each connected collaborator, derived from
 * Yjs awareness states shared by the WebSocket provider.
 */
export function Collaborators({ provider }: CollaboratorsProps) {
  const [collaborators, setCollaborators] = useState<CollaboratorState[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const awareness = provider.awareness;

    function update() {
      const states = awareness.getStates();
      const list: CollaboratorState[] = [];
      states.forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const user = state.user as { name?: string; color?: string; file?: string } | undefined;
        if (user) {
          list.push({
            clientId,
            name: user.name || 'Anonymous',
            color: user.color || '#6b7280',
            file: user.file,
          });
        }
      });
      setCollaborators(list);
    }

    awareness.on('change', update);
    update();

    return () => {
      awareness.off('change', update);
    };
  }, [provider]);

  const totalOnline = collaborators.length + 1; // +1 for self

  return (
    <div className="relative flex items-center gap-2">
      {/* Online count badge */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
        title={`${totalOnline} user${totalOnline !== 1 ? 's' : ''} online`}
      >
        <Users className="size-3.5" />
        <span>{totalOnline} online</span>
        <Circle className="size-2 fill-green-500 text-green-500" />
      </button>

      {/* Avatar stack */}
      <div className="flex -space-x-1.5">
        {/* Self avatar */}
        <span
          className="inline-flex size-7 items-center justify-center rounded-full bg-orange-500 text-xs font-semibold text-white ring-2 ring-background"
          title="You"
          aria-label="You"
        >
          Y
        </span>
        {/* Collaborator avatars (show up to 5) */}
        {collaborators.slice(0, 5).map(({ clientId, name, color }) => (
          <span
            key={clientId}
            title={name}
            className="inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-background transition-transform hover:scale-110 hover:z-10"
            style={{ backgroundColor: color }}
            aria-label={name}
          >
            {name.charAt(0).toUpperCase()}
          </span>
        ))}
        {collaborators.length > 5 && (
          <span
            className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground ring-2 ring-background"
            title={`${collaborators.length - 5} more`}
          >
            +{collaborators.length - 5}
          </span>
        )}
      </div>

      {/* Expanded panel showing who's editing what */}
      {expanded && collaborators.length > 0 && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border bg-popover p-2 shadow-lg">
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Collaborators
          </p>
          <ul className="space-y-1">
            {collaborators.map(({ clientId, name, color, file }) => (
              <li
                key={clientId}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/50"
              >
                <span
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ backgroundColor: color }}
                >
                  {name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{name}</p>
                  {file && (
                    <p className="truncate text-[10px] text-muted-foreground">
                      Editing {file}
                    </p>
                  )}
                </div>
                <Circle className="size-1.5 shrink-0 fill-green-500 text-green-500" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

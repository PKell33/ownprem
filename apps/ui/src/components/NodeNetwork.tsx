import { useRef, useEffect, useCallback } from 'react';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isAccent: boolean;
  isDragged: boolean;
  targetAngle: number;
  angleChangeTimer: number;
}

const CONNECTION_DISTANCE = 150;
const PULL_STRENGTH = 0.02;
const DAMPING = 0.98;

// Base velocities are scaled by screen size
const BASE_MAX_VELOCITY = 0.0004; // Multiplied by screen diagonal
const BASE_DRIFT_FACTOR = 0.00008;

const COLORS = {
  node: '#c0caf5',
  accent: '#7aa2f7',
};

interface NodeNetworkProps {
  /** Origin point where all nodes start (if not provided, nodes start randomly distributed) */
  origin?: { x: number; y: number };
  /** Number of nodes (defaults to area-based calculation) */
  nodeCount?: number;
  /** Initial expansion speed when using origin (default: 0.15) */
  expansionSpeed?: number;
  /** Whether to enable mouse/touch interaction (default: true) */
  interactive?: boolean;
}

export function NodeNetwork({
  origin,
  nodeCount,
  expansionSpeed = 0.15,
  interactive = true,
}: NodeNetworkProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const animationRef = useRef<number>(0);
  const draggedNodeRef = useRef<Node | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  const initNodes = useCallback((width: number, height: number, originPoint?: { x: number; y: number }) => {
    const area = width * height;
    const diagonal = Math.sqrt(width * width + height * height);
    const count = nodeCount ?? Math.floor(area / 15000);
    const nodes: Node[] = [];

    // Scale velocities based on screen size
    const scaledDrift = BASE_DRIFT_FACTOR * diagonal;
    const scaledExpansion = expansionSpeed * diagonal * 0.001;

    for (let i = 0; i < count; i++) {
      const angle = originPoint
        ? (i / count) * Math.PI * 2 + Math.random() * 0.3
        : Math.random() * Math.PI * 2;

      const speed = originPoint
        ? scaledExpansion * (0.5 + Math.random() * 0.5)
        : scaledDrift * (0.5 + Math.random() * 0.5);

      // Starting position
      let x: number, y: number;
      if (originPoint) {
        // Start clustered at origin with small random offset
        const offsetRadius = Math.random() * 5;
        const offsetAngle = Math.random() * Math.PI * 2;
        x = originPoint.x + Math.cos(offsetAngle) * offsetRadius;
        y = originPoint.y + Math.sin(offsetAngle) * offsetRadius;
      } else {
        // Start randomly distributed
        x = Math.random() * width;
        y = Math.random() * height;
      }

      nodes.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: originPoint ? 2 + Math.random() * 2 : 3 + Math.random() * 2,
        isAccent: Math.random() < (originPoint ? 0.2 : 0.15),
        isDragged: false,
        targetAngle: angle,
        angleChangeTimer: Math.random() * (originPoint ? 100 : 200) + (originPoint ? 50 : 100),
      });
    }

    nodesRef.current = nodes;
  }, [nodeCount, expansionSpeed]);

  const updateNodes = useCallback((width: number, height: number) => {
    const nodes = nodesRef.current;
    const draggedNode = draggedNodeRef.current;
    const diagonal = Math.sqrt(width * width + height * height);

    // Scale velocities based on screen size
    const maxVelocity = BASE_MAX_VELOCITY * diagonal;
    const driftForce = BASE_DRIFT_FACTOR * diagonal * 0.05;

    for (const node of nodes) {
      if (node.isDragged) {
        const targetX = mouseRef.current.x;
        const targetY = mouseRef.current.y;
        node.vx = (targetX - node.x) * 0.3;
        node.vy = (targetY - node.y) * 0.3;
        node.x += node.vx;
        node.y += node.vy;
        continue;
      }

      // Apply pull from dragged node to connected nodes
      if (draggedNode) {
        const dx = draggedNode.x - node.x;
        const dy = draggedNode.y - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < CONNECTION_DISTANCE * 1.5 && distance > 0) {
          const normalizedDist = distance / (CONNECTION_DISTANCE * 1.5);
          const force = PULL_STRENGTH * Math.pow(1 - normalizedDist, 2);
          node.vx += (dx / distance) * force * distance * 0.1;
          node.vy += (dy / distance) * force * distance * 0.1;
        }
      }

      // Smooth drift - gradually change direction
      node.angleChangeTimer--;
      if (node.angleChangeTimer <= 0) {
        const currentAngle = Math.atan2(node.vy, node.vx);
        node.targetAngle = currentAngle + (Math.random() - 0.5) * Math.PI * 0.5;
        node.angleChangeTimer = Math.random() * 300 + 150;
      }

      // Apply gentle drift force
      node.vx += Math.cos(node.targetAngle) * driftForce;
      node.vy += Math.sin(node.targetAngle) * driftForce;

      // Apply damping
      node.vx *= DAMPING;
      node.vy *= DAMPING;

      // Clamp velocity
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      if (speed > maxVelocity) {
        node.vx = (node.vx / speed) * maxVelocity;
        node.vy = (node.vy / speed) * maxVelocity;
      }

      // Update position
      node.x += node.vx;
      node.y += node.vy;

      // Bounce off edges smoothly
      const margin = node.radius + 5;
      if (node.x < margin) {
        node.x = margin;
        node.vx = Math.abs(node.vx) * 0.5;
        node.targetAngle = Math.random() * Math.PI - Math.PI / 2;
      } else if (node.x > width - margin) {
        node.x = width - margin;
        node.vx = -Math.abs(node.vx) * 0.5;
        node.targetAngle = Math.random() * Math.PI + Math.PI / 2;
      }

      if (node.y < margin) {
        node.y = margin;
        node.vy = Math.abs(node.vy) * 0.5;
        node.targetAngle = Math.random() * Math.PI;
      } else if (node.y > height - margin) {
        node.y = height - margin;
        node.vy = -Math.abs(node.vy) * 0.5;
        node.targetAngle = -Math.random() * Math.PI;
      }
    }
  }, []);

  const draw = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const nodes = nodesRef.current;

    // Clear canvas
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    // Draw connections
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < CONNECTION_DISTANCE) {
          const opacity = 0.4 * Math.pow(1 - distance / CONNECTION_DISTANCE, 1.5);
          const lineWidth = 1.5 * (1 - distance / CONNECTION_DISTANCE) + 0.5;
          ctx.lineWidth = lineWidth;
          ctx.strokeStyle = `rgba(122, 162, 247, ${opacity})`;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }

    // Draw nodes
    for (const node of nodes) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

      if (node.isAccent) {
        ctx.fillStyle = COLORS.accent;
        ctx.shadowColor = COLORS.accent;
        ctx.shadowBlur = 10;
      } else {
        ctx.fillStyle = COLORS.node;
        ctx.shadowBlur = 0;
      }

      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, []);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    updateNodes(width, height);
    draw(ctx, width, height);

    animationRef.current = requestAnimationFrame(animate);
  }, [updateNodes, draw]);

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = width;
    canvas.height = height;

    initNodes(width, height, origin);
  }, [initNodes, origin]);

  const findNodeAt = useCallback((x: number, y: number): Node | null => {
    const nodes = nodesRef.current;
    for (const node of nodes) {
      const dx = x - node.x;
      const dy = y - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < node.radius + 10) {
        return node;
      }
    }
    return null;
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (!interactive) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mouseRef.current = { x, y };

    const node = findNodeAt(x, y);
    if (node) {
      node.isDragged = true;
      draggedNodeRef.current = node;
    }
  }, [findNodeAt, interactive]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    mouseRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const handleMouseUp = useCallback(() => {
    if (draggedNodeRef.current) {
      draggedNodeRef.current.isDragged = false;
      const angle = Math.random() * Math.PI * 2;
      // Calculate scaled drift based on current canvas size
      const canvas = canvasRef.current;
      const diagonal = canvas
        ? Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height)
        : 1000;
      const drift = BASE_DRIFT_FACTOR * diagonal;
      draggedNodeRef.current.vx = Math.cos(angle) * drift;
      draggedNodeRef.current.vy = Math.sin(angle) * drift;
      draggedNodeRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!interactive) return;
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    mouseRef.current = { x, y };

    const node = findNodeAt(x, y);
    if (node) {
      node.isDragged = true;
      draggedNodeRef.current = node;
    }
  }, [findNodeAt, interactive]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    mouseRef.current = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  }, []);

  const handleTouchEnd = useCallback(() => {
    handleMouseUp();
  }, [handleMouseUp]);

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);

    const canvas = canvasRef.current;
    if (canvas && interactive) {
      // Mousedown on canvas to start drag
      canvas.addEventListener('mousedown', handleMouseDown);
      // Mousemove and mouseup on window to continue drag even over other elements
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
      window.addEventListener('touchmove', handleTouchMove, { passive: true });
      window.addEventListener('touchend', handleTouchEnd);
    }

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (canvas && interactive) {
        canvas.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        canvas.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [handleResize, handleMouseDown, handleMouseMove, handleMouseUp, handleTouchStart, handleTouchMove, handleTouchEnd, animate, interactive]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ touchAction: 'none' }}
    />
  );
}

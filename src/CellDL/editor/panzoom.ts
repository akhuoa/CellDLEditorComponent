/******************************************************************************

CellDL Editor

Copyright (c) 2022 - 2025 David Brooks

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

******************************************************************************/

import type { Extent } from '#editor/geometry'

import { getViewbox } from '#root/utils/svgUtils'
import { Point } from '#root/utils/points'

import type { EditGuides } from './editguides'

//==============================================================================

export class PanZoom {
    #panning: boolean = false
    #pointerDownPosition: Point = new Point()

    #svgDiagram: SVGSVGElement | null = null
    #editGuides: EditGuides | null = null
    #container: HTMLElement
    #containerSize: Point = new Point()
    #resizeObserver: ResizeObserver
    #listeners = new AbortController()

    #minScale: number = 0.125
    #scale: number = 1
    #maxScale: number = 32
    #step: number = 0.05

    constructor(container: HTMLElement) {
        container.addEventListener('wheel', this.#wheelEvent.bind(this),
                                   { passive: true, signal: this.#listeners.signal })
        this.#container = container
        this.#containerSize = new Point(container.clientWidth, container.clientHeight)
        this.#resizeObserver = new ResizeObserver(this.#resizeObservation.bind(this))
        this.#resizeObserver.observe(container)
    }

    destroy() {
        this.#listeners.abort()
        this.#resizeObserver.disconnect()
        this.#svgDiagram = null
        this.#editGuides = null
    }

    get panning() {
        return this.#panning
    }

    get scale() {
        return this.#scale
    }

    #currentViewbox(): Extent {
        return getViewbox(this.#svgDiagram as SVGSVGElement)
    }

    #setViewbox(viewbox: Extent) {
        this.#editGuides?.viewboxUpdated(viewbox)
        this.#svgDiagram?.setAttribute('viewBox', viewbox.map((n) => String(n)).join(' '))
    }

    enable(svgDiagram: SVGSVGElement, editGuides: EditGuides) {
        this.#editGuides = editGuides
        // Scale large diagrams down to fit container
        let viewbox = getViewbox(svgDiagram)
        if (viewbox[2] * this.#containerSize.y >= viewbox[3] * this.#containerSize.x) {
            // Too wide, so scale width
            this.#scale = this.#containerSize.x / viewbox[2]
            viewbox[1] -= (this.#containerSize.y / this.#scale - viewbox[3]) / 2
            viewbox[3] = this.#containerSize.y / this.#scale
        } else {
            // Too high, so scale height
            this.#scale = this.#containerSize.y / viewbox[3]
            viewbox[0] -= (this.#containerSize.x / this.#scale - viewbox[2]) / 2
            viewbox[2] = this.#containerSize.x / this.#scale
        }
        if (this.#minScale > this.#scale) {
            this.#minScale = this.#scale
        }

        // Otherwise centre small diagrams that don't require scaling down
        if (this.#scale >= 1) {
            this.#scale = 1
            viewbox = getViewbox(svgDiagram)
            const delta = this.#containerSize.subtract({ x: viewbox[2], y: viewbox[3] })
            viewbox[0] -= delta.x / 2
            viewbox[1] -= delta.y / 2
            viewbox[2] = this.#containerSize.x
            viewbox[3] = this.#containerSize.y
        }

        this.#svgDiagram = svgDiagram
        this.#setViewbox(viewbox)
        this.#panning = false
    }

    disable() {
        this.#svgDiagram = null
        this.#editGuides = null
        this.#panning = false
        this.#scale = 1.0
    }

    pointerDown(event: PointerEvent) {
        this.#panning = true
        this.#pointerDownPosition = Point.fromPoint(event)
    }

    pointerMove(event: PointerEvent): boolean {
        if (this.#svgDiagram && this.#panning) {
            const delta = this.#pointerDownPosition.subtract(event).scalarScale(1.0 / this.#scale)
            if (!delta.isZero) {
                const viewbox = this.#currentViewbox()
                viewbox[0] += delta.x
                viewbox[1] += delta.y
                this.#setViewbox(viewbox)
                this.#pointerDownPosition = Point.fromPoint(event)
                return true
            }
        }
        return false
    }

    pointerUp(_event: PointerEvent) {
        this.#panning = false
    }

    #resizeObservation(entries: ResizeObserverEntry[]) {
        for (const entry of entries) {
            if (entry.target === this.#container) {
                const containerSize = new Point(entry.contentRect.width, entry.contentRect.height)
                // Don't do anything if the container has no size...
                if (containerSize.x === 0 || containerSize.y === 0) {
                    return
                }
                if (this.#svgDiagram) {
                    const viewbox = this.#currentViewbox()
                    // Keep the zoom level (`#scale`) unchanged, so the window shows more or less
                    // of the diagram, and keep the view's centre where it was
                    const centre = new Point(viewbox[0] + viewbox[2]/2, viewbox[1] + viewbox[3]/2)
                    viewbox[2] = containerSize.x / this.#scale
                    viewbox[3] = containerSize.y / this.#scale
                    viewbox[0] = centre.x - viewbox[2]/2
                    viewbox[1] = centre.y - viewbox[3]/2
                    this.#setViewbox(viewbox)
                }
                // Always track our size, so it's right when a diagram is next enabled
                this.#containerSize = containerSize
            }
        }
    }

    #wheelEvent(event: WheelEvent) {
        if (this.#svgDiagram) {
            // Normalise in case shift modifier is used on macOS
            const delta = event.deltaY === 0 && event.deltaX ? event.deltaX : event.deltaY
            const wheel = delta < 0 ? 1 : -1
            const toScale = this.#scale * Math.exp((wheel * this.#step) / 3)
            this.#scale = Math.min(Math.max(toScale, this.#minScale), this.#maxScale)
            const viewSize = this.#containerSize.scalarScale(1.0 / this.#scale)
            const viewbox = this.#currentViewbox()
            // The pointer's position is in viewport coordinates, so we need the container's origin
            // in the viewport now (`offsetLeft/Top` are relative to the container's offset parent,
            // which isn't the page when there are several editors, and the page may have scrolled)
            const containerRect = this.#container.getBoundingClientRect()
            const containerOrigin = new Point(
                containerRect.left + this.#container.clientLeft,
                containerRect.top + this.#container.clientTop
            )
            viewbox[0] +=
                ((viewbox[2] - viewSize.x) * (event.clientX - containerOrigin.x)) / this.#containerSize.x
            viewbox[1] +=
                ((viewbox[3] - viewSize.y) * (event.clientY - containerOrigin.y)) / this.#containerSize.y
            viewbox[2] = viewSize.x
            viewbox[3] = viewSize.y
            this.#setViewbox(viewbox)
        }
    }
}

//==============================================================================

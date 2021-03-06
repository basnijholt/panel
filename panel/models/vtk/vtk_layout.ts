import * as p from "@bokehjs/core/properties"

import {div} from "@bokehjs/core/dom"
import {clone} from "@bokehjs/core/util/object"
import {HTMLBox} from "@bokehjs/models/layouts/html_box"
import {ColorMapper} from "@bokehjs/models/mappers/color_mapper"

import {PanelHTMLBoxView, set_size} from "../layout"

import {vtkns, VolumeType, majorAxis} from "./vtk_utils"
import {VTKColorBar} from "./vtk_colorbar"

export abstract class AbstractVTKView extends PanelHTMLBoxView{
  model: AbstractVTKPlot
  protected _vtk_container: HTMLDivElement
  protected _vtk_renwin: any
  protected _orientationWidget: any
  protected _widgetManager: any
  protected _setting_camera: boolean = false

  _add_colorbars(): void {
    //construct colorbars
    const old_info_div = this.el.querySelector(".vtk_info")
    if (old_info_div)
      this.el.removeChild(old_info_div)
    if (this.model.color_mappers.length < 1) return

    const info_div = document.createElement("div")
    const expand_width = "350px"
    const collapsed_width = "30px"
    info_div.classList.add('vtk_info')
    info_div.style.width = expand_width
    info_div.style.padding = "0px 2px 0px 2px"
    info_div.style.maxHeight = "150px"
    info_div.style.height = "auto"
    info_div.style.backgroundColor = "rgba(255, 255, 255, 0.4)"
    info_div.style.borderRadius = "10px"
    info_div.style.margin = "2px"
    info_div.style.boxSizing = "border-box"
    info_div.style.overflow = "hidden"
    info_div.style.overflowY = "auto"
    info_div.style.transition = "width 0.1s linear"
    info_div.style.bottom = "0px"
    info_div.style.position = "absolute"
    this.el.appendChild(info_div)

    //construct colorbars
    const colorbars: VTKColorBar[] = []
    this.model.color_mappers.forEach((mapper) => {
      const cb = new VTKColorBar(info_div, mapper)
      colorbars.push(cb)
    })

    //content when collapsed
    const dots = document.createElement('div');
    dots.style.textAlign = "center"
    dots.style.fontSize = "20px"
    dots.innerText = "..."

    info_div.addEventListener('click', () => {
      if(info_div.style.width === collapsed_width){
        info_div.removeChild(dots)
        info_div.style.height = "auto"
        info_div.style.width = expand_width
        colorbars.forEach((cb) => info_div.appendChild(cb.canvas))
      } else {
        colorbars.forEach((cb) => info_div.removeChild(cb.canvas))
        info_div.style.height = collapsed_width
        info_div.style.width = collapsed_width
        info_div.appendChild(dots)
      }
    })

    info_div.click()
  }

  connect_signals(): void {
    super.connect_signals()
    this.connect(this.model.properties.data.change, () => {
      this.invalidate_render()
    })
    this.connect(this.model.properties.orientation_widget.change, () => {
      this._orientation_widget_visibility(this.model.orientation_widget)
    })
    this.connect(this.model.properties.camera.change, () => this._set_camera_state())
    this.connect(this.model.properties.color_mappers.change, () => this._add_colorbars())
  }

  _orientation_widget_visibility(visibility: boolean): void {
    this._orientationWidget.setEnabled(visibility)
    if(visibility)
      this._widgetManager.enablePicking()
    else
      this._widgetManager.disablePicking()
    this._orientationWidget.updateMarkerOrientation()
    this._vtk_renwin.getRenderWindow().render()
  }

  _create_orientation_widget(): void {
    const axes = vtkns.AxesActor.newInstance()

    // add orientation widget
    const orientationWidget = vtkns.OrientationMarkerWidget.newInstance({
      actor: axes,
      interactor: this._vtk_renwin.getInteractor(),
    })
    orientationWidget.setEnabled(true)
    orientationWidget.setViewportCorner(
      vtkns.OrientationMarkerWidget.Corners.BOTTOM_RIGHT
    )
    orientationWidget.setViewportSize(0.15)
    orientationWidget.setMinPixelSize(100)
    orientationWidget.setMaxPixelSize(300)

    this._orientationWidget = orientationWidget

    const widgetManager = vtkns.WidgetManager.newInstance()
    widgetManager.setRenderer(orientationWidget.getRenderer())

    const widget = vtkns.InteractiveOrientationWidget.newInstance()
    widget.placeWidget(axes.getBounds())
    widget.setBounds(axes.getBounds())
    widget.setPlaceFactor(1)

    const vw = widgetManager.addWidget(widget)
    this._widgetManager = widgetManager

    // Manage user interaction
    vw.onOrientationChange(({direction} : any) => {
      const camera = this._vtk_renwin.getRenderer().getActiveCamera()
      const focalPoint = camera.getFocalPoint()
      const position = camera.getPosition()
      const viewUp = camera.getViewUp()

      const distance = Math.sqrt(
        Math.pow(position[0]-focalPoint[0],2) +
        Math.pow(position[1]-focalPoint[1],2) +
        Math.pow(position[2]-focalPoint[2],2)
      )

      camera.setPosition(
        focalPoint[0] + direction[0] * distance,
        focalPoint[1] + direction[1] * distance,
        focalPoint[2] + direction[2] * distance
      )

      if (direction[0])
        camera.setViewUp(majorAxis(viewUp, 1, 2))
      if (direction[1])
        camera.setViewUp(majorAxis(viewUp, 0, 2))
      if (direction[2])
        camera.setViewUp(majorAxis(viewUp, 0, 1))

      this._orientationWidget.updateMarkerOrientation()
      this._vtk_renwin.getRenderer().resetCameraClippingRange()
      this._vtk_renwin.getRenderWindow().render()
    })
    this._orientation_widget_visibility(this.model.orientation_widget)
  }


  _get_camera_state(): void {
    if (!this._setting_camera) {
      this._setting_camera = true
      const state = clone(this._vtk_renwin.getRenderer().getActiveCamera().get())
      delete state.classHierarchy
      delete state.vtkObject
      delete state.vtkCamera
      delete state.viewPlaneNormal
      this.model.camera = state
      this._setting_camera = false
    }
  }

  _set_camera_state(): void {
    if (!this._setting_camera) {
      this._setting_camera = true
      try {
        if(this.model.camera)
          this._vtk_renwin.getRenderer().getActiveCamera().set(this.model.camera)
      } finally {
        this._setting_camera = false
      }
      this._orientationWidget.updateMarkerOrientation()
      this._vtk_renwin.getRenderer().resetCameraClippingRange()
      this._vtk_renwin.getRenderWindow().render()
    }
  }

  render(): void {
    super.render()
    this._orientationWidget = null
    this._vtk_container = div()
    set_size(this._vtk_container, this.model)
    this.el.appendChild(this._vtk_container)
    this._vtk_renwin = vtkns.FullScreenRenderWindow.newInstance({
      rootContainer: this.el,
      container: this._vtk_container
    })
    this._remove_default_key_binding()
    this._create_orientation_widget()
    this._vtk_renwin.getRenderer().getActiveCamera().onModified(
      () => this._get_camera_state()
    )
    this._set_camera_state()
    this.model.renderer_el = this._vtk_renwin
    this._add_colorbars()
  }

  after_layout(): void {
    super.after_layout()
    this._vtk_renwin.resize()
  }

  _remove_default_key_binding(): void {
    const interactor = this._vtk_renwin.getInteractor()
    document.querySelector('body')!.removeEventListener('keypress',interactor.handleKeyPress)
    document.querySelector('body')!.removeEventListener('keydown',interactor.handleKeyDown)
    document.querySelector('body')!.removeEventListener('keyup',interactor.handleKeyUp)
  }
}

export namespace AbstractVTKPlot {
  export type Attrs = p.AttrsOf<Props>
  export type Props = HTMLBox.Props & {
    data: p.Property<string|VolumeType>
    camera: p.Property<any>
    orientation_widget: p.Property<boolean>
    color_mappers: p.Property<ColorMapper[]>
  }
}

export interface AbstractVTKPlot extends AbstractVTKPlot.Attrs {}

export abstract class AbstractVTKPlot extends HTMLBox {
  properties: AbstractVTKPlot.Props
  renderer_el: any

  static __module__ = "panel.models.vtk"

  constructor(attrs?: Partial<AbstractVTKPlot.Attrs>) {
    super(attrs)
  }

  getActors() : any[] {
    return this.renderer_el.getRenderer().getActors()
  }

  static init_AbstractVTKPlot(): void{
    this.define<AbstractVTKPlot.Props>({
      orientation_widget: [ p.Boolean, false ],
      camera:             [ p.Instance       ],
      color_mappers:      [ p.Array,      [] ],
    })

    this.override({
      height: 300,
      width: 300
    })
  }
}

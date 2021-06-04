/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/


import {
  EmphasizeElements,
  EmphasizeElementsProps,
  IModelApp,
  IModelConnection,
  ScreenViewport,
  ViewState,
} from "@bentley/imodeljs-frontend";
import { MarkupApp, MarkupSelected } from "@bentley/imodeljs-markup";
import { UiError, WidgetState } from "@bentley/ui-abstract";
import { Point } from "@bentley/ui-core";
import {
  ConfigurableUiControlConstructor,
  ContentGroup,
  ContentLayoutDef,
  CursorInformation,
  Frontstage,
  FrontstageDeactivatedEventArgs,
  FrontstageManager,
  FrontstageProps,
  FrontstageProvider,
  FrontstageReadyEventArgs,
  MarkupTools,
  PopupManager,
  Widget,
  Zone,
} from "@bentley/ui-framework";
import React from "react";
import { MarkupFrontstage } from "../../MarkupFrontstage";
import { createMarkupSavedViewData } from "../../services/SavedView";
import {
  AddMarkupEvent,
  MarkupFrontstageConstants,
  StopMarkupEvent,
  ViewElementDictionary,
} from "../../util/MarkupTypes";
import { createViewStateProps } from "../../util/MarkupViewStateAdapter";
import MarkupSettingsPanel from "../toolbar/MarkupSettingsPanel";
import { MarkupToolWidget } from "../toolbar/MarkupToolWidget";


export class MarkupFrontstageProvider extends FrontstageProvider {
  private readonly _contentGroup: ContentGroup;
  private readonly _rulesetId = "Default";
  private _emphasizedElementsProps?: EmphasizeElementsProps;
  private _iModelConnection: IModelConnection;
  private _isEditable: boolean;
  private _isMarkupActive = false;
  private _markupLayout: ContentLayoutDef;
  private _svg?: string;
  private _viewElements?: ViewElementDictionary;
  private _viewState: ViewState | undefined;
  private _thumbnailSize: number;

  constructor(
    viewState: ViewState | undefined,
    iModelConnection: IModelConnection,
    isEditable: boolean,
    contentControlClassId: string | ConfigurableUiControlConstructor,
    svg?: string,
    viewElements?: ViewElementDictionary,
    emphasizedElementsProps?: EmphasizeElementsProps,
    thumbnailSize?: number
  ) {
    super();

    this._isEditable = isEditable;
    this._viewState = viewState;
    this._iModelConnection = iModelConnection;

    this._svg = svg;
    this._viewElements = viewElements;
    this._emphasizedElementsProps = emphasizedElementsProps;
    // this width is set for a thumbnail. If full size is needed, this should be updated.
    this._thumbnailSize = thumbnailSize ?? 350;

    this._markupLayout = new ContentLayoutDef({
      descriptionKey: MarkupFrontstage.translate("contentLayoutDefDescription"),
      priority: 50,
      id: MarkupFrontstageConstants.VIEW_LAYOUT_ID,
    });

    this._contentGroup = new ContentGroup({
      contents: [
        {
          id: MarkupFrontstageConstants.VIEW_LAYOUT_ID,
          classId: contentControlClassId,
          applicationData: {
            viewState: this._viewState,
            iModelConnection: this._iModelConnection,
            rulesetId: this._rulesetId,
            disableDefaultViewOverlay: true,
          },
        },
      ],
    });

    FrontstageManager.onFrontstageReadyEvent.addListener(
      this._onFrontstageReady
    );
    FrontstageManager.onFrontstageDeactivatedEvent.addListener(
      this._onFrontstageDeactivated
    );
  }

  /** Get Add Markup event. */
  public readonly onAddMarkupEvent = new AddMarkupEvent();

  /** Get Stop Markup event. */
  public readonly onStopMarkupEvent = new StopMarkupEvent();

  private _onCloseAsync = async () => {
    this._onFrontstageChange();
    this.onStopMarkupEvent.raiseEvent();
    await FrontstageManager.closeNestedFrontstage();
  };

  private _onFrontstageDeactivated = async (
    args: FrontstageDeactivatedEventArgs
  ) => {
    if (
      args.deactivatedFrontstageDef.id ===
      MarkupFrontstageConstants.FRONTSTAGE_ID
    ) {
      await this._stopMarkup();
      FrontstageManager.onFrontstageDeactivatedEvent.removeListener(
        this._onFrontstageDeactivated
      );
    }
  };

  private _onFrontstageReady = async (args: FrontstageReadyEventArgs) => {
    if (args.frontstageDef.id === MarkupFrontstageConstants.FRONTSTAGE_ID) {
      await this._startMarkup();
    } else {
      FrontstageManager.onFrontstageReadyEvent.removeListener(
        this._onFrontstageReady
      );
    }
  };

  // call this whenever you need to persist the view from changing from one view to other.
  private _onFrontstageChange() {
    const newViewPort = IModelApp.viewManager.selectedView;
    if (newViewPort) {
      const oldViewState = newViewPort.view.clone();
      const oldEmphasizedElementsProps = this._emphasizedElementsProps;
      FrontstageManager.onFrontstageReadyEvent.addOnce(() => {
        const selectedView = IModelApp.viewManager.selectedView;
        if (selectedView && oldViewState) {
          // change viewflags here if needed, should be before following.
          selectedView.changeView(oldViewState);
        }
        // Emphasized elements are not saved in view state, which we have to preserve manually as follow
        // order matters so apply following after viewstage changes
        if (selectedView && oldEmphasizedElementsProps) {
          this._createEmphasizedElements(
            oldEmphasizedElementsProps,
            selectedView
          );
        }
      });
    }
  }

  /**
   * Cancels the active markup frontstage.
   */
  public onCancelAsync = async () => {
    this._isMarkupActive = false;
    await MarkupApp.stop();
    await this._onCloseAsync();
  };

  /**
   * Saves the markup data and closes active markup frontstage
   */
  public onSaveAsync = async () => {
    this._isMarkupActive = false;
    const contentControl = this._contentGroup.getContentControlById(
      MarkupFrontstageConstants.VIEW_LAYOUT_ID
    );
    const currentViewPort = contentControl?.viewport;
    const savedView =
      currentViewPort && createMarkupSavedViewData(currentViewPort);
    const markupData = await MarkupApp.stop();
    try {
      if (savedView && currentViewPort && markupData.svg) {
        const markupViewStateProps = createViewStateProps(
          currentViewPort,
          markupData.svg
        );
        savedView.markup = markupData.svg;
        savedView.emphasizedElementsProps = savedView.is2d
          ? savedView.emphasizedElementsProps
          : this._emphasizedElementsProps
          ? JSON.stringify(this._emphasizedElementsProps)
          : undefined;
        if (markupData.image) {
          this.onAddMarkupEvent.raiseEvent({
            savedView,
            thumbImage: markupData.image,
            markupViewStateProps,
          });
        }
      }
    } catch (error) {
      throw new UiError(
        MarkupFrontstage.loggerCategory(MarkupFrontstageProvider),
        error
      );
    } finally {
      await this._onCloseAsync();
    }
  };

  // use following to create emphasized elements
  private _createEmphasizedElements(
    emphasizedElementsProps: EmphasizeElementsProps,
    view: ScreenViewport
  ) {
    if (view && emphasizedElementsProps) {
      const emphasizedElements = EmphasizeElements.getOrCreate(view);
      emphasizedElements.fromJSON(emphasizedElementsProps, view);
    }
  }

  private _svgRect = (svg: string | SVGSVGElement) => {
    if (typeof svg === "string") {
      const dom = new DOMParser().parseFromString(svg, "image/svg+xml");
      if (
        dom.getElementsByTagName("parsererror") &&
        dom.getElementsByTagName("parsererror").length > 0
      ) {
        throw new UiError(
          MarkupFrontstage.loggerCategory(MarkupFrontstageProvider),
          `MarkupData.svg is invalid: ${
            dom.getElementsByTagName("parsererror")[0].textContent
          }`
        );
      } else {
        svg = (dom.firstElementChild as unknown) as SVGSVGElement;
      }
    }
    return {
      width: svg.width.baseVal.value ?? svg.viewBox.baseVal.width,
      height: svg.height.baseVal.value ?? svg.viewBox.baseVal.height,
    };
  };

  private _startMarkup = async () => {
    const view = IModelApp.viewManager.selectedView;
    if (view) {
      const markupData = this._svg
        ? {
            rect: this._svgRect(this._svg),
            svg: this._svg,
          }
        : undefined;
      if (this._emphasizedElementsProps) {
        this._createEmphasizedElements(this._emphasizedElementsProps, view);
      }
      MarkupApp.props.result.maxWidth = this._thumbnailSize;
      await MarkupApp.start(view, markupData);

      if (markupData) {
        const container = MarkupApp.markup!.markupDiv.parentElement;
        if (container) {
          // center the markup
          container.style.right = container.style.bottom = "0";
          container.style.margin = "auto";
        }
        if (markupData?.svg && !this._isEditable) {
          // following will add CSS pointer events to none so that dragging plus selection of element be
          // stopped for old non-editable markups, however if dragged and selected the element - then we get
          // markup setting tool, and it is resizable, requires changes in boxSelect in iModelJs itself.
          MarkupApp.markup?.svgMarkup?.each((i, el) => {
            el[i].attr({ "pointer-events": "none" });
          });
        }
      }

      MarkupApp.markup?.selected.onChanged.addListener((el: MarkupSelected) => {
        if (el?.handles) {
          const selectedElements = Array.from(el.elements);
          const selectedElement =
            selectedElements?.length > 0 ? selectedElements[0] : undefined;
          const rbox = selectedElement ? selectedElement.rbox() : el.svg.rbox();
          // only use rbox to get cx and y if selected element otherwise it'll get the viewport cx and y
          // in which case use cursor position instead
          const cx = selectedElement
            ? Math.floor(rbox.x)
            : CursorInformation.cursorPosition.x;
          const y = selectedElements
            ? Math.floor(rbox.y - 40)
            : CursorInformation.cursorPosition.y;
          const popupPoint = Point.create({ x: cx, y });
          PopupManager.addOrUpdatePopup({
            id: MarkupFrontstageConstants.WIDGET_ID,
            pt: popupPoint,
            component: <MarkupSettingsPanel point={popupPoint} />,
            parentDocument: view.vpDiv.ownerDocument
          });
          FrontstageManager.activeFrontstageDef
            ?.findWidgetDef(MarkupFrontstageConstants.WIDGET_ID)
            ?.setWidgetState(WidgetState.Open);
        } else {
          PopupManager.removePopup(MarkupFrontstageConstants.WIDGET_ID);
          FrontstageManager.activeFrontstageDef
            ?.findWidgetDef(MarkupFrontstageConstants.WIDGET_ID)
            ?.setWidgetState(WidgetState.Hidden);
        }
      });
      this._isMarkupActive = true;
    }
  };

  private _stopMarkup = async () => {
    if (this._isMarkupActive) {
      await MarkupApp.stop();
      this._isMarkupActive = false;
    }
  };

  public get frontstage(): React.ReactElement<FrontstageProps> {
    return (
      <Frontstage
        id={MarkupFrontstageConstants.FRONTSTAGE_ID}
        data-testid={MarkupFrontstageConstants.FRONTSTAGE_ID}
        defaultTool={MarkupTools.selectToolDef}
        defaultLayout={this._markupLayout}
        contentGroup={this._contentGroup}
        isInFooterMode={true}
        topLeft={
          <Zone
            widgets={[
              <Widget
                key={MarkupFrontstageConstants.TOOL_WIDGET_KEY}
                isFreeform={true}
                element={
                  <MarkupToolWidget
                    closeMarkupFrontstageAsync={this.onCancelAsync}
                    isEditable={this._isEditable}
                  />
                }
              />,
            ]}
          />
        }
        topCenter={
          <Zone
            widgets={[
              <Widget
                key={MarkupFrontstageConstants.TOOL_SETTINGS_WIDGET_KEY}
                isToolSettings={true}
              />,
            ]}
          />
        }
        {...this._viewElements}
      />
    );
  }
}
